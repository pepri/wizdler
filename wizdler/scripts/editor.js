var App = {
	ajax: function(config) {
		var fileProtocol = 'file://';
		if (config.url.substr(0, fileProtocol.length) == fileProtocol) {
			chrome.extension.sendRequest({
				command: 'ajax',
				url: config.url,
				type: config.method,
				contentType: config.contentType,
				data: config.data,
				headers: config.headers,
			}, function(result) {
				if (config[result.type]) {
					if (result.type == 'success' && config.dataType == 'xml') {
						result.args[0] = new DOMParser().parseFromString(result.args[0], 'text/xml');
					}
					console.log(config, result);
					config[result.type].apply(null, result.args);
				}
			});
		} else {
			if (config.headers) {
				config.beforeSend = function(xhr) {
					var headers = config.headers;
					if (headers)
						for (var x in headers)
							if (headers.hasOwnProperty(x))
								xhr.setRequestHeader(x, headers[x]);
				};
			}
			$.ajax(config);
		}
	},

	bind: function(name) {
		var me = this;
		return function() {
			me[name].apply(me, arguments);
		};
	},

	showRequestBody: function() {
		$('.nav-tabs a[href=#request]').tab('show');
		this.requestEditor.resize();
	},

	showResponseBody: function() {
		$('.nav-tabs a[href=#response]').tab('show');
		this.responseEditor.resize();
	},

	onShowRequestClick: function(e) {
		e.preventDefault();
		this.showRequestBody();
	},

	onShowResponseClick: function(e) {
		e.preventDefault();
		this.showResponseBody();
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

	refreshCtxs: function(callback) {
		if (this.ctxs) {
			callback.call(this);
			return;
		}
		var me = this;
		var wsdl = Wsdl.parse(this.url, this.xml, true, function() {
			var addresses = new Object;
			var ctxs = new Object;
			var wsdl = this;
			$.each(wsdl.services, function() {
				var service = this;
				$.each(service.ports, function() {
					var port = this;
					var binding = wsdl.bindings[port.binding.full];
					if (binding) {
						var portType = wsdl.portTypes[binding.type.full];
						$.each(binding.operations, function() {
							var operation = this;
							var portTypeOperation = portType.operations[this.name.full];
							var address = me.address(addresses, [service.name.local, port.name.local, operation.name.local].join('/'));
							ctxs[address] = {
								wsdl: wsdl,
								generator: wsdl.generator,
								service: service,
								binding: binding,
								port: port,
								portType: portType,
								portTypeOperation: portTypeOperation,
								operation: operation
							};
						});
					}
				});
			});
			me.ctxs = ctxs;
			callback.call(me);
		});
	},

	onGoClick: function(e) {
		var me = this;
		this.request.url = $('#address').val();
		this.request.method = $('#method').val();
		this.request.body = this.requestEditor.getSession().getValue();
		e.preventDefault();
		App.ajax({
			url: this.request.url,
			type: this.request.method,
			contentType: 'text/xml; charset=utf-8',
			dataType: 'xml',
			data: this.request.body,
			headers: me.request.headers,
			success: function(xml) {
				var text = new XMLSerializer().serializeToString(xml);
				me.responseBody = vkbeautify.xml(text);
				me.responseEditor.getSession().setValue(me.responseBody);
				me.showResponseBody();
			},
			error: function(xhr, type, statusText) {
				var xml = xhr.responseXML;
				var text = new XMLSerializer().serializeToString(xml);
				me.responseBody = vkbeautify.xml(text);
				me.responseEditor.getSession().setValue(me.responseBody);
				me.showResponseBody();
				setTimeout(function() {
					alert('Failed to get response (' + statusText + ').');
				});
			}
		});
	},

	onExitClick: function(e) {
		e.preventDefault();
		close();
	},

	createEditor: function(id) {
		var editor = ace.edit(id);
		editor.setTheme('ace/theme/vs');
		editor.renderer.setShowGutter(false);
		editor.getSession().setUseWrapMode(true);
		editor.commands.addCommands([{
			name: "ungotoline",
			bindKey: {
				mac: "Command-L"
			},
			exec: function(editor, line) {
				return false;
			},
			readOnly: true
		}]);
		var Mode = require('ace/mode/xml').Mode;
		editor.getSession().setMode(new Mode);
		return editor;
	},

	open: function() {
		var ctx = this.ctxs[this.addr];
		if (!ctx)
			throw new Error('Invalid address to open in editor: ' + this.addr);

		this.request = Wsdl.generateRequest(ctx);
		$('#method').val(this.request.method);
		$('#address').val(this.request.url);
		this.requestEditor.getSession().setValue(this.request.body);
		this.showRequestBody();
	},

	parseArgs: function() {
		var hash = location.hash.substr(1);
		var args = hash.split('&');
		var result = new Object;
		for (var i = 0, n = args.length; i < n; ++i) {
			var pair = args[i];
			if (pair) {
				var keyVal = pair.split('=');
				var key = decodeURIComponent(keyVal[0]);
				var value = decodeURIComponent(keyVal[1]);
				result[key] = value;
			}
		}
		return result;
	},

	run: function() {
		$('#go').click(this.bind('onGoClick'));
		$('a[href=#request]').click(this.bind('onShowRequestClick'));
		$('a[href=#response]').click(this.bind('onShowResponseClick'));
		$('a[href=#exit]').click(this.bind('onExitClick'));
		$('.dropdown-toggle').dropdown();
		$('#status')
			.ajaxStart(function() {
				$(this).text('Loading...')
			})
			.ajaxStop(function() {
				$(this).text('')
			})
			.ajaxError(function() {
				$(this).text('Error.')
			})

		this.requestEditor = this.createEditor('request');
		this.responseEditor = this.createEditor('response');

		var me = this;
		var args = this.parseArgs();
		if (args.wsdl) {
			document.title = args.title;
			App.ajax({
				url: args.wsdl,
				dataType: 'text',
				success: function(data) {
					me.url = args.wsdl;
					me.addr = args.addr;
					me.xml = data;
					me.refreshCtxs(function() {
						me.open();
					});
				},
				error: function() {
					throw new Error('Failed to load data from url: ' + args.wsdl);
				}
			});
		}
	}
};

App.run();