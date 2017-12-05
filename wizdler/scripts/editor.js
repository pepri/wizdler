Wsse = {
	NS: {
		wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
		wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd'
	},
	PasswordType: {
		text: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText',
		digest: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest',
	},
	generateNonce: function() {
		var len = 2 * 20;
		var chars = '0123456789abcdef';
		var bytes = new Array(len);
		for (var i = 0; i < len; ++i) {
			bytes[i] = chars[0|Math.random() * 16];
		}
		return CryptoJS.enc.Hex.parse(bytes.join('')).toString(CryptoJS.enc.Base64);
	},
	generateDigest: function(nonce, created, password) {
		return CryptoJS.SHA1(
			CryptoJS.enc.Hex.parse(
				CryptoJS.enc.Base64.parse(nonce).toString() +
				CryptoJS.enc.Latin1.parse(created.toISOString() + password)
			)
		).toString(CryptoJS.enc.Base64);
	},
	sha1: function(x) {
		return x;
	}
};
function XMLDoc(text, ns) {
	this.xml = new DOMParser().parseFromString(text, 'text/xml');
	this.ns = ns || {};
};
XMLDoc.prototype.qname = function(qname, defaultNS) {
	var arr = qname.split(':');
	if (arr.length == 1) {
		var ns = defaultNS;
		var localName = arr[0];
	} else {
		var ns = this.ns[arr[0]] || arr[0];
		var localName = arr[1];
	}
	return {
		ns: ns,
		localName: localName
	}
};
XMLDoc.prototype.element = function(qname) {
	return qname.ns ? this.xml.createElementNS(qname.ns, qname.localName) : this.xml.createElement(qname.localName);
};
XMLDoc.prototype.setAttribute = function(el, qname, value) {
	if (qname.ns) {
		el.setAttributeNS(qname.ns, qname.localName, value);
	} else {
		el.setAttribute(qname.localName, value);
	}
};
XMLDoc.prototype.fragment = function(obj, fragment) {
	//console.log('fragment', fragment);
	fragment = fragment || this.xml.createDocumentFragment();
	if (typeof obj == 'string') {
		fragment.appendChild(this.xml.createTextNode(obj));
	} else if (Array.isArray(obj)) {
		for (var i = 0, n = obj.length; i < n; ++i) {
			this.fragment(obj[i], fragment);
		}
	} else {
		for (var x in obj) {
			if (obj.hasOwnProperty(x)) {
				if (x == 'text()') {
					fragment.appendChild(this.xml.createTextNode(obj[x]));
				} else if (x[0] == '@') {
					var qname = this.qname(x.substr(1));
					this.setAttribute(fragment, qname, obj[x]);
				} else {
					var qname = this.qname(x);
					var el = fragment.appendChild(this.element(qname));
					this.fragment(obj[x], el);
				}
			}
		}
	}
	return fragment;
};
XMLDoc.prototype.replaceChild = function(path, obj) {
	var arr = path.split('/');
	var el = this.xml.documentElement;
	for (var i = 0, n = arr.length; i < n; ++i) {
		var qname = this.qname(arr[i], el.namespaceURI);
		el = el.getElementsByTagNameNS(qname.ns, qname.localName)[0] ||
				el.insertBefore(document.createElementNS(qname.ns, qname.localName), el.firstChild);
	}
	el.parentNode.replaceChild(this.fragment(obj), el);
};
XMLDoc.prototype.toString = function() {
	var text = this.xml ? new XMLSerializer().serializeToString(this.xml) : '';
	return text;
};
var App = {
	ajax: function(config) {
		var fileProtocol = 'file://';
		if (config.url.substr(0, fileProtocol.length) == fileProtocol) {
			chrome.runtime.sendMessage({
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
					//console.log(config, result);
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
		this.resizeHeader($('#request-headers'));
	},

	showResponseBody: function() {
		$('.nav-tabs a[href=#response]').tab('show');
		this.resizeHeader($('#response-headers'));
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
		this.saveState();
		e.preventDefault();
		var authentication = this.getAuthentication();
		var headers = this.request.headers;
		var body = this.request.body;
		if (authentication.enabled) {
			switch (authentication.type) {
				case 'http-basic':
					headers['Authorization'] = 'Basic ' + btoa([authentication.username, authentication.password].join(':'));
					break;
				case 'wsse-passwordtext':
					var xml = new XMLDoc(body, Wsse.NS);
					xml.replaceChild('Header/wsse:Security/wsse:UsernameToken', {
						'wsse:UsernameToken': {
							'wsse:Username': authentication.username,
							'wsse:Password': {
								'@Type': Wsse.PasswordType.text,
								'text()': authentication.password
							}
						}
					});
					body = xml.toString();
					break;
				case 'wsse-passworddigest':
					var nonce = Wsse.generateNonce();
					var created = new Date;
					var xml = new XMLDoc(body, Wsse.NS);
					xml.replaceChild('Header/wsse:Security/wsse:UsernameToken', {
						'wsse:UsernameToken': {
							'wsse:Username': authentication.username,
							'wsse:Password': {
								'@Type': Wsse.PasswordType.digest,
								'text()': Wsse.generateDigest(nonce, created, authentication.password)
							},
							'Nonce': nonce,
							'wsu:Created': created.toISOString()
						}
					});
					body = xml.toString();
					break;
			}
		}
		App.ajax({
			url: this.request.url,
			type: this.request.method,
			contentType: 'text/xml; charset=utf-8',
			dataType: 'xml',
			data: body,
			headers: headers,
			success: function(xml) {
				try {
					var text = new XMLSerializer().serializeToString(xml);
					me.responseBody = vkbeautify.xml(text);
				} catch (e) {
					me.responseBody = xml;
				}
				me.responseEditor.getSession().setValue(me.responseBody);
				me.showResponseBody();
			},
			error: function(xhr, type, statusText) {
				if (xhr.responseXML) {
					var xml = xhr.responseXML;
					var text = new XMLSerializer().serializeToString(xml);
					me.responseBody = vkbeautify.xml(text);
				} else {
					me.responseBody = xhr.responseText;
				}
				me.responseEditor.getSession().setValue(me.responseBody);
				me.showResponseBody();
				setTimeout(function() {
					alert('Failed to get response (' + statusText + ').');
				});
			},
			complete: function(resp) {
				$('#response-headers').val(resp.getAllResponseHeaders().replace(/^\s*|\s*$/g, ''));
				me.resizeHeader($('#response-headers'));
			}
		});
	},

	onHeadersClick: function(e) {
		document.body.classList.toggle('show-headers');
		this.resizeHeader($('#request-headers'));
		this.resizeHeader($('#response-headers'));
		this.saveState();
		e.preventDefault();
	},

	onHeadersInput: function(e) {
		this.resizeHeader($(e.target));
		e.preventDefault();
	},

	resizeHeader: function($textarea) {
		var rows = $textarea.val().split(/\r?\n/).length;
		$textarea.prop('rows', rows);
		$textarea.height(rows * 16);
		var height = 20;
		if (document.body.classList.contains('show-headers')) {
			height += rows * 16 + 14;
		}
		//$textarea.closest('.editor-top').height(height);
		var $editor = $textarea.closest('.tab-pane').find('.editor');
		var editorEl = $editor.get(0);
		//editorEl.style.top = (height + 1) + 'px';
		editorEl.editor.resize();
	},

	onHeadersChange: function(e) {
		this.request.headers = this.deserializeHeaders(e.target.value);
		this.saveState();
		e.preventDefault();
	},

	onAuthenticationClick: function(e) {
		document.body.classList.toggle('show-authentication');
		this.saveState();
		e.preventDefault();
	},

	onAuthChange: function(e) {
		this.saveState();
	},

	onExitClick: function(e) {
		this.saveState();
		e.preventDefault();
		close();
	},

	onRememberClick: function(e) {
		if (e)
			e.preventDefault();
		if (!document.body.classList.contains('remember-requests')) {
			document.body.classList.toggle('remember-requests', true);
			this.saveState(true);
		} else {
			document.body.classList.toggle('remember-requests', false);
			this.clearState();
		}
	},

	onResetClick: function(e) {
		if (e)
			e.preventDefault();
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
	},

	clearState: function() {
		var key = 'wizdler:' + this.url + ':' + this.addr;
		localStorage.removeItem(key);
	},

	saveState: function(force) {
		var key = 'wizdler:' + this.url + ':' + this.addr;
		if (!force && !localStorage.hasOwnProperty(key)) {
			return false;
		}
		localStorage[key] = JSON.stringify({
			headers: document.body.classList.contains('show-headers'),
			authentication: this.getAuthentication(),
			request: {
				url: this.request.url,
				method: this.request.method,
				headers: this.request.headers,
				body: this.request.body,
			}
		});
		return true;
	},

	loadState: function() {
		var key = 'wizdler:' + this.url + ':' + this.addr;
		var state;
		try {
			state = JSON.parse(localStorage[key] || null)
		} catch (e) {
			state = null;
		}
		if (!state) {
			document.body.classList.toggle('remember-requests', false);
			return false;
		}
		document.body.classList.toggle('remember-requests', true);
		this.request = state.request;
		$('#address').val(this.request.url);
		$('#method').val(this.request.method);
		this.requestEditor.getSession().setValue(this.request.body);
		$('#request-headers').val(this.serializeHeaders(this.request.headers));
		document.body.classList.toggle('show-headers', state.headers);
		this.resizeHeader($('#request-headers'));
		this.setAuthentication(state.authentication);
		return true;
	},

	getAuthentication: function() {
		return {
			enabled: document.body.classList.contains('show-authentication'),
			type: document.getElementById('auth-type').value,
			username: document.getElementById('auth-username').value,
			password: document.getElementById('auth-password').value
		};
	},

	setAuthentication: function(auth) {
		auth = auth || {};
		document.body.classList.toggle('show-authentication', auth.enabled);
		document.getElementById('auth-type').value = auth.type || 'http-basic';
		document.getElementById('auth-username').value = auth.username || '';
		document.getElementById('auth-password').value = auth.password || '';
	},

	createEditor: function(id) {
		var editor = ace.edit(id + '-editor');
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

	serializeHeaders: function(headers) {
		var result = new Array;
		for (var x in headers)
			if (headers.hasOwnProperty(x))
				result.push(x + ': ' + headers[x]);
		return result.join('\n');
	},

	deserializeHeaders: function(text) {
		var lines = text.split(/\r?\n/);
		var result = new Object;
		for (var i = 0, n = lines.length; i < n; ++i) {
			var line = lines[i];
			var pos = line.indexOf(':');
			if (pos != -1)
				result[line.substr(0, pos)] = line.substr(pos + 1).replace(/^\s+/, '');
		}
		return result;
	},

	open: function() {
		var ctx = this.ctxs[this.addr];
		if (!ctx)
			throw new Error('Invalid address to open in editor: ' + this.addr);

		this.request = Wsdl.generateRequest(ctx);
		$('#method').val(this.request.method);
		$('#address').val(this.request.url);
		$('#request-headers').val(this.serializeHeaders(this.request.headers));
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
		if (navigator.platform == 'Win32')
			$(document.body).addClass('platform-win32');
		var me = this;
		$('#go').click(this.bind('onGoClick'));

		var that = this;
		$('#request').keypress(function(event){
			if (event.ctrlKey && (event.keyCode == 13 || event.keyCode == 10)) {
				that.onGoClick(event);
			}
		});

        $('#response').keypress(function(event){
            if (event.ctrlKey && (event.keyCode == 13 || event.keyCode == 10)) {
                that.onGoClick(event);
            }
        });

		$('a[href=#request]').click(this.bind('onShowRequestClick'));
		$('a[href=#response]').click(this.bind('onShowResponseClick'));
		$('a[href=#exit]').click(this.bind('onExitClick'));
		$('a[href=#remember]').click(this.bind('onRememberClick'));
		$('a[href=#reset]').click(this.bind('onResetClick'));
		$('a[href=#authenticate]').click(this.bind('onAuthenticationClick'));
		$('a[href=#headers]').click(this.bind('onHeadersClick'));
		$('#request-headers').change(this.bind('onHeadersChange'))
		$('#auth-type').change(this.bind('onAuthChange'))
		$('#auth-username').change(this.bind('onAuthChange'))
		$('#auth-password').change(this.bind('onAuthChange'))
		$('.headers-editor')
			.each(function() {
				this.oninput = me.bind('onHeadersInput');
			});
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
		$('#request-editor').get(0).editor = this.requestEditor;
		$('#response-editor').get(0).editor = this.responseEditor;

		var args = this.parseArgs();
		this.url = args.wsdl;
		this.addr = args.addr;
		document.title = args.title;

		if (!this.loadState()) {
			this.onResetClick();
		}
	}
};

App.run();
