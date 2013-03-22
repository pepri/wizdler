var App = {
	url: null,

	// Initializes expand/collapse images (used in CSS).
	initializeCanvasImages: function() {
		var ctx = document.getCSSCanvasContext('2d', 'arrowRight', 10, 10);
		ctx.fillStyle = 'rgb(90,90,90)';
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(0, 8);
		ctx.lineTo(7, 4);
		ctx.lineTo(0, 0);
		ctx.fill();
		ctx.closePath();

		var ctx = document.getCSSCanvasContext('2d', 'arrowDown', 10, 10);
		ctx.fillStyle = 'rgb(90,90,90)';
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(8, 0);
		ctx.lineTo(4, 7);
		ctx.lineTo(0, 0);
		ctx.fill();
		ctx.closePath();
	},

	// Initializes scroller.
	initializeScroller: function() {
		$('body').addClass('scroller');
		$('#tree').wrap(
			$('<div class="antiscroll-wrap">')
				.append($('<div class="antiscroll-inner">'))
		);
		setTimeout(function() {
			var scroller = $('.antiscroll-wrap').antiscroll().data('antiscroll');
			var resize = function() {
				scroller.inner
					.width($(window).width())
					.height($(window).height());
				scroller.refresh();
			};
			$(window).resize(resize);
			resize();
		}, 500);
	},

	// Downloads data interactively.
	downloadFile: function(name, data) {
		// if in extension, the content page must download the file
		if (chrome.tabs) {
			chrome.tabs.getSelected(null, function(tab) {
				chrome.tabs.sendRequest(tab.id, {
					command: 'download',
					name: name,
					data: data
				}, function() { });
			});
		// otherwise, dispatch download
		} else {
			var a = document.createElement('a');
			a.download = name;
			a.href = data;
			var ev = document.createEvent('MouseEvents');
			ev.initEvent('click', true, true);
			a.dispatchEvent(ev);
		}
	},

	// Gets the WSDL file.
	getWSDL: function(callback) {
		// if in extension, the WSDL is retrieved via content page
		if (chrome.tabs)
			chrome.tabs.getSelected(null, function(tab) {
				chrome.tabs.sendRequest(tab.id, { command: 'getXml' }, function(data) {
					callback(null, data);
				});
			});
		// otherwise, it is downloaded from the specified URL 
		else
			$.ajax({
				url: App.url,
				dataType: 'text',
				success: function(data) {
					callback(null, data);
				},
				error: function() {
					callback(new Error('Failed to load data from url: ' + App.url));
				}
			});
	},

	// Gets the URL of the WSDL file. Useful to determine base URL when
	// downloading the imported XSD files.
	getUrl: function(callback) {
		if (chrome.tabs)
			chrome.tabs.getSelected(null, function(tab) {
				callback(tab.url);
			});
		else
			callback(App.url);
	},

	// Creates a valid filename from the URL.	
	getFilenameFromURL: function(url, ext) {
		var name = url
			.substring(url.lastIndexOf('/') + 1)
			.replace(/[^a-z0-9\-\.]/gi, '_');
		if (ext && name.substr(-ext.length) != ext)
			name += ext;
		return name;
	},

	// Creates a unique address for the requested string.
	address: function(addresses, requested) {
		var original = requested;
		var index = 1;
		while (addresses.hasOwnProperty(requested))
			requested = original + ' (' + (++index) + ')';
		addresses[requested] = true;
		return '#/' + requested;
	},

	// Sorts array of objects by qualified name in the "name" property.
	sort: function(arr) {
		arr.sort(function(a, b) {
			return a.name.local.localeCompare(b.name.local);
		});
		return arr;
	},

	// Appends HTML content (a tree with services, ports and operations).
	createTree: function(wsdl) {
		var addresses = new Object;
		var $servicesUl = $('<ul class="collapsible">')
		$.each(App.sort(wsdl.services), function() {
			var service = this;
			var $serviceLi = $('<li>')
				.append(
					$('<span>').append(
						$('<a id="wsdl">')
							.attr('href', App.address(addresses, 'download'))
							.text(this.name.local)
							.data('ctx', {
								wsdl: wsdl,
								service: service
							}))
				)
				.appendTo($servicesUl);
			var $portsUl = $('<ul class="collapsible">').appendTo($serviceLi);
			$.each(App.sort(this.ports), function() {
				var port = this;
				var $portLi = $('<li>')
					.append(
						$('<span>')
							.text(this.name.local)
					)
					.prop('title', this.description)
					.appendTo($portsUl);
				var binding = wsdl.bindings[this.binding.full];
				if (binding) {
					var portType = wsdl.portTypes[binding.type.full];
					var $operationsUl = $('<ul class="operations">').appendTo($portLi);
					$.each(App.sort(binding.operations), function() {
						var operation = this;
						var portTypeOperation = portType.operations[this.name.full];
						var description = this.description || portTypeOperation.description;
						var address = App.address(addresses, [service.name.local, port.name.local, operation.name.local].join('/'));
						var $operationLi = $('<li>')
							.append(
								$('<a>')
									.prop('href', address)
									.text(this.name.local)
									.data('ctx', {
										wsdl: wsdl,
										address: address,
										service: service,
										port: port,
										binding: binding,
										port: port,
										portType: portType,
										portTypeOperation: portTypeOperation,
										operation: operation
									})
							)
							.prop('title', description)
							.appendTo($operationsUl);
					});
				}
			});
		});
		$servicesUl.find('ul.collapsible>li>ul').parents().addClass('expanded');
		$servicesUl.appendTo($('#tree'));
		
		if (chrome.tabs)
			App.initializeScroller();
	},

	sendTabRequest: function(request, callback, args) {
		var me = this;
		chrome.tabs.getSelected(null, function(tab) {
			var doRequest = function() {
				chrome.tabs.sendRequest(tab.id, request, function(err) {
					console.log(args);
					if (callback)
						callback.apply(me, args || new Array);
				});
			};
			doRequest();
		});
	},

	// Opens an editor.
	openEditor: function(opts) {
		var req = $.extend(opts, {
			command: 'openEditor'
		});
		if (!chrome.extension) {
			console.log(req);
			return;
		}
		chrome.extension.sendRequest(req);
	},

	// Called when WSDL is read.
	onReceiveWSDL: function(err, data) {
		if (err) {
			alert(err.message);
			return;
		}
		App.getUrl(function(url) {
			Wsdl.parse(url, data, false, App.createTree);
		});
	},
	
	onListItemClick: function() {
		var $this = $(this).parent();
		if ($this.hasClass('collapsed'))
			$this.removeClass('collapsed').addClass('expanded');
		else if ($this.hasClass('expanded'))
			$this.removeClass('expanded').addClass('collapsed');
		return false;
	},
	
	generateFilename: function(names, url, ext) {
		var i = 0;
		var name = App.getFilenameFromURL(url);
		if (!name)
			name = 'file';
		while (names.hasOwnProperty(name + ext))
			name = name + '.' + (++i);
		names[name + ext] = true;
		return name + ext;
	},
	
	onServiceClick: function(e) {
		var ctx = $(this).data('ctx');
		var wsdl = ctx.wsdl;

		e.stopImmediatePropagation();
		e.preventDefault();

		App.getUrl(function(url) {
			wsdl._parseSchema(url, function() {
				var zipName = App.getFilenameFromURL(url, '.zip');
				if (wsdl.zip) {
					App.downloadFile(zipName, wsdl.zip);
					return;
				}

				var gen = App.generateFilename;
				var names = new Object;
				var zip = new JSZip();
				zip.file(gen(names, url, '.wsdl'), wsdl.text || '');
				for (var i = 0, imports = wsdl.imports, n = imports.length; i < n; ++i)
					zip.file(gen(names, imports[i].location, '.xsd'), imports[i].text || '');
				wsdl.zip = 'data:application/zip;base64,' + zip.generate();
				App.downloadFile(zipName, wsdl.zip);
			});
		});
	},
	
	onOperationClick: function(e) {
		e.preventDefault();
		var ctx = $(this).data('ctx');
		App.getUrl(function(url) {
			ctx.wsdl._parseSchema(url, function() {
				App.openEditor({
					title: ctx.operation.name.local,
					address: ctx.address,
					url: ctx.wsdl.url,
					resources: ctx.wsdl.resources
				});
			});
		});
	},
	
	run: function() {
		this.initializeCanvasImages();
		$(document).on('click', 'ul.collapsible li>span:first-child', this.onListItemClick);
		$(document).on('click', 'a[id=wsdl]', this.onServiceClick);
		$(document).on('click', 'ul.operations>li>a', this.onOperationClick);
		
		document.addEventListener('DOMContentLoaded', function() {
			App.getWSDL(App.onReceiveWSDL);
		});
	}
};

App.run();

