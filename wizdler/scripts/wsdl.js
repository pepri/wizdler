// WSDL document
function Wsdl(url, text) {
	this.url = url;
	this.text = text;
	this.messages = new Object;
	this.portTypes = new Object;
	this.bindings = new Object;
	this.services = new Array;
	this.imports = new Array;

	this.resources = new Object;
	this.resources[url] = text;
}

// Important namespaces.
Wsdl.ns = {
	soap: 'http://schemas.xmlsoap.org/wsdl/soap/',
	soap12: 'http://schemas.xmlsoap.org/wsdl/soap12/',
	soapEnv: 'http://schemas.xmlsoap.org/soap/envelope/',
	soap12Env: 'http://www.w3.org/2003/05/soap-envelope',
	http: 'http://schemas.xmlsoap.org/wsdl/http/',
	wsdl: 'http://schemas.xmlsoap.org/wsdl/',
	schema: 'http://www.w3.org/2001/XMLSchema'
};

// Gets directory from the URL
Wsdl._getDirectory = function(url) {
	return url.substr(0, url.lastIndexOf('/'));
};

Wsdl._combineURL = function(baseURL, url) {
	// if url is absolute, do nothing
	if (/^(?:https?|file):\/\/|^\//.test(url))
		return url;
	// otherwise return combined url
	return baseURL + '/' + url.replace(/^\//, '');
};

// Parses WSDL.
Wsdl.parse = function(url, text, loadSchema, callback, scope) {
	var wsdl = new Wsdl(url, text);
	wsdl._parseWSDL(url, function() {
		if (!loadSchema)
			wsdl._loaded = true;
		wsdl._parseSchema(url, callback, scope, [wsdl]);
	}, scope);
	return wsdl;
};

// Formatters.	
Wsdl.format = {
	// Formats the document as XML message.
	xml: function(doc) {
		var text = doc ? new XMLSerializer().serializeToString(doc) : '';
		// fix unqualified namespaces
		text = text.replace(/ xmlns="\0"/g, ' xmlns=""');
		return vkbeautify.xml(text);
	}
};

Wsdl._generateSoapMessage = function(ctx, soapVersion) {
	var ns = Wsdl.ns[soapVersion + 'Env'];
	var doc = document.implementation.createDocument(ns, 'Envelope', null);
	// SOAP headers
	var headers = ctx.operation.input[soapVersion].headers;
	if (headers.length) {
		var hdr = doc.createElementNS(ns, 'Header');
		doc.documentElement.appendChild(hdr);
		for (var i = 0, n = headers.length; i < n; ++i) {
			var message = ctx.wsdl.messages[headers[i].message.full];
			var el = ctx.wsdl.generator.writeXml(message.parts[0].element).documentElement;
			hdr.appendChild(doc.importNode(el));
		}
	}

	// SOAP body
	var message = ctx.wsdl.messages[ctx.portTypeOperation.input.full];
	var bodyEl = doc.createElementNS(ns, 'Body');
	doc.documentElement.appendChild(bodyEl);
	var body = ctx.operation.input[soapVersion].body;
	if (ctx.operation[soapVersion].style == 'rpc') {
		var wrapper = doc.createElementNS(ctx.operation.name.ns, ctx.operation.name.local);
		bodyEl.appendChild(wrapper);
		$.each(message.parts, function() {
			var el = doc.createElementNS(ctx.operation.name.ns, this.name);
			wrapper.appendChild(el);
			el.appendChild(document.createTextNode('[' + this.type.local + ']'));
		});
	} else {
		// assert message.parts.length == 0
		// assert message.parts[0].name == 'parameters'
		if (!body.parts)
			body.parts = message.parts[0].name;
		for (var i = 0, n = message.parts.length; i < n; ++i) {
			var part = message.parts[i];
			if (part.name == body.parts) {
				var el = ctx.wsdl.generator.writeXml(part.element).documentElement;
				bodyEl.appendChild(doc.importNode(el));
			}
		}
	}

	return doc;
};

Wsdl.generateRequest = function(ctx) {
	// nastav adresu a text
	var request = {
		method: 'POST',
		url: '',
		headers: new Object,
		body: ''
	};
	if (ctx.operation && ctx.operation.input) {
		if (ctx.operation.soap12) {
			request.url = ctx.port.soap12.address;
			if (ctx.operation.soap12.hasOwnProperty('action')) {
			    request.headers['SOAPAction'] = ctx.operation.soap12.action;
			    request.headers['Content-Type'] = 'application/soap+xml; charset="utf-8"';
			}
			try {
				request.body = Wsdl.format.xml(Wsdl._generateSoapMessage(ctx, 'soap12'));
			} catch (e) {
				request.body = e.message;
			}
		} else if (ctx.operation.soap) {
			request.url = ctx.port.soap.address;
			if (ctx.operation.soap.hasOwnProperty('action')) {
			    request.headers['SOAPAction'] = ctx.operation.soap.action;
			    request.headers['Content-Type'] = 'text/xml; charset="utf-8"';
			}
			try {
				request.body = Wsdl.format.xml(Wsdl._generateSoapMessage(ctx, 'soap'));
			} catch (e) {
				request.body = e.message;
			}
		} else if (ctx.operation.http) {
			request.method = ctx.binding.http.verb;
			request.url = ctx.port.http.address + ctx.operation.http.location;
		}
	}
	return request;
};

// Gets the value of the attribute with specified namespace.
Wsdl._attr = function(element, name, ns) {
	if (!element)
		return '';
	return element.getAttributeNS(ns || null, name);
};

// Gets child elements by tag name with specified namespace.
Wsdl._children = function(element, ns, tagName) {
	var children = element.childNodes;
	var result = [];
	for (var i = 0, n = children.length; i < n; ++i) {
		var child = children[i];
		if (child.nodeType == 1 && child.namespaceURI == ns && child.localName == tagName)
			result.push(child);
	}
	return result;
};

// Gets the first child element by tag name with specified namespace.
Wsdl._child = function(element, ns, name) {
	return $(Wsdl._children(element, ns, name)).get(0);
};

// Resolves namespace of an XML node.
Wsdl._resolveNS = function(node, name) {
	var resolver = node.ownerDocument.createNSResolver(node);
	var index = name.indexOf(':');
	var ns, local;
	if (index == -1) {
		ns = node.ownerDocument.documentElement.getAttributeNS(null, 'targetNamespace');
		local= name;
	} else {
		ns = resolver.lookupNamespaceURI(name.substr(0, index));
		local = name.substr(index + 1);
	}
	return {
		ns: ns,
		local: local,
		full: ns + ':' + local
	};
};

// Prototype.
Wsdl.prototype = {
	// The URL of the WSDL.
	url: null,
	
	// The XML that represents the WSDL as text.
	text: null,
	
	// The XML that represents the WSDL as XML document.
	_XML: null,

	// Messages of the web service.
	messages: null,
	
	// Port types of the web service.
	portTypes: null,
	
	// Bindings of the web service.
	bindings: null,
	
	// Services of the web service.
	services: null,
	
	// Imports of the web service.
	imports: null,

	// All web resources downloaded.
	resources: null,
	
	// Indicates whether the XML text was parsed.
	_parsed: false,

	// Indicates whether all related XSD schemas were loaded and parsed.
	_loaded: false,
	
	// The XML sample generator.
	generator: null,
	
	// Helper for downloading WSDL-related resources.
	_ajax: function(options, callback) {
		var url = options.url;
		var resources = this.resources;
		if (resources.hasOwnProperty(url))
			callback(null, resources[url]);
		var me = this;
		$.ajax($.extend(options, {
			success: function(data) {
				resources[options.url] = data;
				callback(null, data);
			},
			error: function() {
				callback(new Error('Failed to load data from url: ' + options.url));
			}
		}));
	},
	
	// Calls the function.
	_apply: function(callback, scope, args) {
		if (!callback)
			return;
		callback.apply(scope || this, args);
	},
	
	// Gets the WSDL as XML document.
	_getXML: function() {
		if (!this._XML) {
			var parser = new DOMParser;
			this._XML = parser.parseFromString(this.text, 'text/xml');
		}
		return this._XML;
	},
	
	// Gets the XSD schema.
	_getSchemas: function() {
		// shortcuts
		var ns = Wsdl.ns;
		var attr = Wsdl._attr;
		var children = Wsdl._children;
		var child = Wsdl._child;

		// get the schema
		var xml = this._getXML();
		var types = child(xml.documentElement, ns.wsdl, 'types');
		var schemas = children(types, ns.schema, 'schema');
		return schemas;
	},
	
	_getImports: function() {
		// shortcuts
		var ns = Wsdl.ns;
		var attr = Wsdl._attr;
		var children = Wsdl._children;
		var child = Wsdl._child;
		
		var result = new Array;
		var push = Array.prototype.push;

		var xml = this._getXML();
		var types = child(xml.documentElement, ns.wsdl, 'types');
		var schema = child(types, ns.schema, 'schema');
		var xml = this._getXML();

		if (schema)
			push.apply(result, $(children(schema, Wsdl.ns.schema, 'import')));

		return result;
	},
	
	// Resolves import. Overrride this to cache imports or to modify URL.
	_resolveImport: function(baseURL, location, ns, callback) {
		if (!location) {
			callback(new Error('Missing location.'));
			return;
		}
		var url = Wsdl._combineURL(baseURL, location);
		this._ajax({
			url: url,
			dataType: 'text'
		}, function(err, data) {
			callback(err, {
				location: url,
				ns: ns,
				text: data,
				XML: new DOMParser().parseFromString(data, 'text/xml')
			});
		});
	},

	// Resolves all imports in the schema.
	_resolveImports: function(baseURL, imports, callback) {
		var result = new Array;

		// there are no imports to resolve		
		if (!imports.length) {
			callback(result);
			return;
		}

		var count = 0;
		var parser = new DOMParser;
		var done = function(err, imported) {
			if (imported)
				result.push(imported);
			if (++count == imports.length)
				callback(result);
		};
		var me = this;
		for (var i = 0, n = imports.length; i < n; ++i) {
			var loc = imports[i].getAttributeNS(null, 'schemaLocation');
			var ns = imports[i].getAttributeNS(null, 'namespace')
			me._resolveImport(baseURL, loc, ns, done);
		}
	},

	// Parses the schema from the WSDL.	
	_parseSchema: function(url, callback, scope, args) {
		scope = scope || this;
		
		// if already loaded, just call the callback
		if (this._loaded) {
			this._apply(callback, scope, args);
			return;
		}

		// mark as loaded
		this._loaded = true;

		// resolve imports
		var me = this;
		var schemas = this._getSchemas();
		var imports = this._getImports();

		this._resolveImports(Wsdl._getDirectory(url), imports, function(imports) {
			Array.prototype.push.apply(me.imports, imports);
			me.generator = new XmlSampleGenerator(me.targetNamespace, schemas, imports);
			me._apply(callback, scope, args);
		});
	},

	// Parses the SOAP input or output element.	
	_parseSoapInputOrOutput: function(io, soapNs) {
		// shortcuts
		var ns = Wsdl.ns;
		var attr = Wsdl._attr;
		var children = Wsdl._children;
		var child = Wsdl._child;

		var result = {
			body: null,
			headers: new Array
		};
		var body = child(io, soapNs, 'body');
		if (body)
			result.body = {
				parts: attr(body, 'parts'),
				use: attr(body, 'use'),
				encodingStyle: attr(body, 'encodingStyle'),
				namespace: attr(body, 'namespace')
			};
		$.each(children(io, soapNs, 'header'), function() {
			var header = {
				message: Wsdl._resolveNS(this, attr(this, 'message')),
				parts: attr(this, 'part'),
				use: attr(body, 'use'),
				encodingStyle: attr(body, 'encodingStyle'),
				namespace: attr(body, 'namespace'),
				faults: new Array
			};
			$.each(children(this, soapNs, 'headerfault'), function() {
				var fault = {
					message: attr(this, 'message'),
					parts: attr(this, 'part'),
					use: attr(body, 'use'),
					encodingStyle: attr(body, 'encodingStyle'),
					namespace: attr(body, 'namespace')
				};
				header.faults.push(fault);
			});
			result.headers.push(header);
		});
		return result;
	},

	// Parses the HTTP input or output element.	
	_parseHttpInputOrOutput: function(io) {
		// shortcuts
		var ns = Wsdl.ns;
		var child = Wsdl._child;

		var result = {
			urlEncoded: !!child(io, ns.http, 'urlEncoded'),
			urlReplacement: !!child(io, ns.http, 'urlReplacement')
		};
		return result;
	},

	// Parses the WSDL.	
	_parseWSDL: function(url, callback, scope) {
		scope = scope || this;
		
		// if already parsed, just call the callback
		if (this._parsed) {
			this._apply(callback, scope);
			return;
		}

		// mark as parsed
		this._parsed = true;
		
		// shortcuts
		var me = this;
		var ns = Wsdl.ns;
		var attr = Wsdl._attr;
		var children = Wsdl._children;
		var child = Wsdl._child;
		var parser = new DOMParser;
		var xml = parser.parseFromString(this.text, 'text/xml');

		this.targetNamespace = xml.documentElement.getAttributeNS(null, 'targetNamespace');

		// message
		$.each(children(xml.documentElement, ns.wsdl, 'message'), function() {
			var message = {
				name: Wsdl._resolveNS(this, attr(this, 'name')),
				parts: new Array
			};
			// message/part
			$.each(children(this, ns.wsdl, 'part'), function() {
				var element = attr(this, 'element');
				var type = attr(this, 'type');
				var part = {
					name: attr(this, 'name'),
					element: element ? Wsdl._resolveNS(this, element) : null,
					type: type ? Wsdl._resolveNS(this, type) : null
				};
				message.parts.push(part);
			});
			me.messages[message.name.full] = message;
		});
		// portType
		$.each(children(xml.documentElement, ns.wsdl, 'portType'), function() {
			var portType = {
				name: Wsdl._resolveNS(this, attr(this, 'name')),
				operations: new Object
			};
			// portType/operation
			$.each(children(this, ns.wsdl, 'operation'), function() {
				var operation = {
					name: Wsdl._resolveNS(this, attr(this, 'name')),
					description: $(children(this, ns.wsdl, 'documentation')).text(),
					input: Wsdl._resolveNS(this, attr(child(this, ns.wsdl, 'input'), 'message')),
					output: Wsdl._resolveNS(this, attr(child(this, ns.wsdl, 'output'), 'message'))
				};
				portType.operations[operation.name.full] = operation;
			});
			me.portTypes[portType.name.full] = portType;
		});
		// binding
		$.each(children(xml.documentElement, ns.wsdl, 'binding'), function() {
			var binding = {
				name: Wsdl._resolveNS(this, attr(this, 'name')),
				type: Wsdl._resolveNS(this, attr(this, 'type')),
				description: $(children(this, ns.wsdl, 'documentation')).text(),
				operations: new Array
			};
			var soapBinding = child(this, ns.soap, 'binding');
			if (soapBinding)
				binding.soap = {
					transport: attr(soapBinding, 'transport'),
					style: attr(soapBinding, 'style') || 'document'
				};
			var soap12Binding = child(this, ns.soap12, 'binding');
			if (soap12Binding)
				binding.soap12 = {
					style: attr(soap12Binding, 'style') || 'document'
				};
			var httpBinding = child(this, ns.http, 'binding');
			if (httpBinding)
				binding.http = {
					verb: attr(httpBinding, 'verb')
				};
			
			// binding/operation
			$.each(children(this, ns.wsdl, 'operation'), function() {
				var operation = {
					name: Wsdl._resolveNS(this, attr(this, 'name')),
					description: $(children(this, ns.wsdl, 'documentation')).text()
				};
				if (binding.soap) {
					var soapOperation = child(this, ns.soap, 'operation');
					operation.soap = {
						action: attr(soapOperation, 'soapAction'),
						style: attr(soapOperation, 'style') || binding.soap.style
					};
				}
				if (binding.soap12) {
					var soap12Operation = child(this, ns.soap12, 'operation');
					operation.soap12 = {
						action: attr(soap12Operation, 'soapAction'),
						style: attr(soap12Operation, 'style') || binding.soap12.style
					};
				}
				if (binding.http) {
					var httpOperation = child(this, ns.http, 'operation');
					operation.http = {
						location: attr(httpOperation, 'location')
					};
				}
				// binding/operation/input
				var input = child(this, ns.wsdl, 'input');
				if (input) {
					operation.input = new Object;
					if (binding.soap)
						operation.input.soap = me._parseSoapInputOrOutput(input, ns.soap);
					if (binding.soap12)
						operation.input.soap12 = me._parseSoapInputOrOutput(input, ns.soap12);
					if (binding.http)
						operation.input.http = me._parseHttpInputOrOutput(input);
				}
				// binding/operation/output
				var output = child(this, ns.wsdl, 'output');
				if (output) {
					operation.output = new Object;
					if (binding.soap)
						operation.output.soap = me._parseSoapInputOrOutput(output, ns.soap);
					if (binding.soap12)
						operation.output.soap12 = me._parseSoapInputOrOutput(output, ns.soap12);
					if (binding.http)
						operation.output.http = me._parseHttpInputOrOutput(output);
				}
				binding.operations.push(operation);
			});
			me.bindings[binding.name.full] = binding;
		});
		// service
		$.each(children(xml.documentElement, ns.wsdl, 'service'), function() {
			var service = {
				name: Wsdl._resolveNS(this, attr(this, 'name')),
				description: $(children(this, ns.wsdl, 'documentation')).text(),
				ports: new Array
			};
			// service/port
			$.each(children(this, ns.wsdl, 'port'), function() {
				var port = {
					name: Wsdl._resolveNS(this, attr(this, 'name')),
					description: $(children(this, ns.wsdl, 'documentation')).text(),
					binding: Wsdl._resolveNS(this, attr(this, 'binding')),
					address: null
				};
				var binding = me.bindings[port.binding.full];
				if (binding) {
					if (binding.soap)
						port.soap = {
							address: attr(child(this, ns.soap, 'address'), 'location')
						};
					if (binding.soap12)
						port.soap12 = {
							address: attr(child(this, ns.soap12, 'address'), 'location')
						};
					if (binding.http)
						port.http = {
							address: attr(child(this, ns.http, 'address'), 'location')
						};
				}
				service.ports.push(port);
			});
			me.services.push(service);
		});

		this._apply(callback, scope);
	}
};
