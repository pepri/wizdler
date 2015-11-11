function XmlQualifiedName(ns, localName) {
	this.ns = ns;
	this.localName = localName;
};
XmlQualifiedName.fromElement = function(el, name) {
	var resolver = el.ownerDocument.createNSResolver(el);
	var arr = name.split(':');
	if (arr.length != 2)
		throw new Error('Invalid qualified name: ' + name);
	var ns = resolver.lookupNamespaceURI(arr[0]);
	var localName = arr[1];
	return new XmlQualifiedName(ns, localName);
};
XmlQualifiedName.prototype = {
	toString: function() {
		return this.localName + ' (' + this.ns + ')';
	}
};

function XmlValueGenerator() {
};
XmlValueGenerator.anyGenerator = { generateValue: function() { return '[anyType]'; } };
XmlValueGenerator.anySimpleTypeGenerator = { generateValue: function() { return '[anySimpleType]'; } };
XmlValueGenerator.createGenerator = function(dataType, listLength, minOccurs) {
	return {
		generateValue: function() {
			return '[' + dataType + (minOccurs === 0 ? '?' : '') + ']';
		}
	};
};

function XmlSampleGenerator(targetNamespace, schemas, imports) {
	//if (!schema)
	//	throw new Error('Schema was not provided. XML cannot be generated.');
	this.schemas = schemas;
	this.imports = imports;
	this.root = null;
	this.elementTypesProcessed = null;
	this.instanceElementsProcessed = null;
	this.listLength = 3;
	this.targetNamespace = targetNamespace;
	this.globalElements = this.getGlobalElements();
	this.globalTypes = this.getGlobalTypes();
}

XmlSampleGenerator.prototype = {
	writeXml: function(rootName) {
		this.elementTypesProcessed = new Array;
		var schemaEl = this.findRootSchemaElement(rootName);
		var root = this.generateElement(schemaEl);
		if (!root)
			throw new Error('Schema did not lead to generation of a valid XML document.');
		this.instanceElementsProcessed = new Object;
		this.instanceElementsProcessed[root] = root;
		var doc = document.implementation.createDocument(root.qname.ns, root.qname.localName, null);
		if (root.documentation)
			doc.insertBefore(doc.createComment(root.documentation), doc.documentElement);
		//this.processElementAttrs(doc.documentElement, root);
		//this.processComment(doc.documentElement, root);
		//this.checkIfMixed(doc.documentElement, root);
		if (root.valueGenerator != null) {
			var value;
			if (root.isFixed)
				value = root.fixedValue;
			else if (root.hasDefault)
				value = root.defaultValue;
			else
				value = root.valueGenerator.generateValue();
			doc.documentElement.appendChild(doc.createTextNode(value));
		} else {
			for (var g = root.child; g; g = g.sibling)
				this.processGroup(doc.documentElement, g);
		}
		return doc;
	},

	processGroup: function(parentEl, grp) {
		if (!grp.isGroup) {
			this.processElement(parentEl, grp);
		} else { // it is a group node of sequence or choice
			if (!grp.isChoice) {
				for (var i = 0, n = grp.occurs; i < n; ++i) {
					var childGroup = grp.child;
					while (childGroup) {
						this.processGroup(parentEl, childGroup);
						childGroup = childGroup.sibling;
					}
				}
			} else {
				this.processChoiceGroup(parentEl, grp);
			}
		}
	},

	processElement: function(parentEl, elem) {
		if (this.instanceElementsProcessed[elem])
			return;
		this.instanceElementsProcessed[elem] = elem;
		var doc = parentEl.ownerDocument;
		for (var i = 0, n = elem.occurs; i < n; ++i) {
			if (elem.documentation)
				parentEl.appendChild(doc.createComment(elem.documentation));
			if (elem.qname) {
				if (!elem.valueGenerator && (elem.minOccurs != 1 || elem.maxOccurs != 1)) {
					if (elem.minOccurs === 0 && elem.maxOccurs === 0)
						parentEl.appendChild(doc.createComment(' Optional '));
					else
						parentEl.appendChild(doc.createComment(' Occurs: ' + elem.minOccurs + ' - ' + elem.maxOccurs + ' '));
				}
				// unqualified elements are not preserved in Chrome's XMLSerializer, so do some workaround
				var el = doc.createElementNS(elem.qname.ns === null ? '\0' : elem.qname.ns, elem.qname.localName);
				//this.processElementAttrs(el, elem);
				//this.processComment(el, elem);
				//this.checkIfMixed(el, elem);
				if (elem.isNillable) {
					if (elem.genNil) {
						this.writeNillable(el);
						elem.genNil = false;
						continue;
					} else
						elem.genNil = true;
				}
				if (elem.valueGenerator != null) {
					if (elem.isFixed)
						el.appendChild(doc.createTextNode(elem.fixedValue));
					else if (elem.hasDefault)
						el.appendChild(doc.createTextNode(elem.defaultValue));
					else
						el.appendChild(doc.createTextNode(elem.valueGenerator.generateValue()));
				} else {
					for (var g = elem.child; g; g = g.sibling)
						this.processGroup(el, g);
				}
				parentEl.appendChild(el);
			}
		}
		delete this.instanceElementsProcessed[elem];
	},

	findSchemaDocEl: function(el) {
		var ns = 'http://www.w3.org/2001/XMLSchema';
		for (var e = el; e; e = e.parentNode)
			if (e.localName == 'schema' && e.namespaceURI == ns)
				return e;
		return null;
	},

	generateElement: function(schemaEl, parentEl, any) {
		var globalDecl = schemaEl;
		var ref = schemaEl.getAttributeNS(null, 'ref');
		if (ref) {
			var qname = XmlQualifiedName.fromElement(schemaEl, ref);
			var globalDecl = this.globalElements[qname.ns + ':' + qname.localName];
			if (!globalDecl) {
				if (parentEl) {
					parentEl.addChild(new CommentElement('Invalid type reference: ' + qname));
				}
				return null;
			}
		}
		if (this.isAbstract(globalDecl))
			return null;
		var elem = this.elementTypesProcessed[globalDecl.dataIndex];
		if (elem != null) {
			var minOccurs = this.getMinOccurs(schemaEl);
			var maxOccurs = this.getMaxOccurs(schemaEl);
			if (!any && minOccurs > 0)
				parentEl.addChild(elem.clone(this.getOccurs(minOccurs, maxOccurs)));
			return null;
		}
		var schemaDocEl = this.findSchemaDocEl(schemaEl);
		var targetNamespace = schemaDocEl.getAttributeNS(null, 'targetNamespace') || this.targetNamespace;
		var qualifiedElements = schemaDocEl.getAttributeNS(null, 'elementFormDefault') == 'qualified';
		if (parentEl && !qualifiedElements)
			targetNamespace = null;
		elem = new InstanceElement(new XmlQualifiedName(targetNamespace, globalDecl.getAttributeNS(null, 'name')));
		if (parentEl)
			parentEl.addChild(elem);
		// get minOccurs, maxOccurs alone from the current particle, everything else pick up from globalDecl
		var minOccurs = this.getMinOccurs(any || schemaEl);
		var maxOccurs = this.getMinOccurs(any || schemaEl);
		elem.minOccurs = minOccurs;
		elem.maxOccurs = maxOccurs;
		var occurs = this.getOccurs(minOccurs, maxOccurs);
		var defaultValue = globalDecl.getAttributeNS(null, 'default');
		var fixedValue = globalDecl.getAttributeNS(null, 'fixed');
		var isNillable = globalDecl.getAttributeNS(null, 'nillable');
		var schemaType = this.getSchemaType(globalDecl, 'type');
		if (schemaType == this.anyType) {
			elem.valueGenerator = XmlValueGenerator.anyGenerator;
		} else if (this.isComplexType(schemaType)) {
			globalDecl.dataIndex = this.elementTypesProcessed.length;
			this.elementTypesProcessed[globalDecl.dataIndex] = elem;
			var isAbstract = schemaType.getAttributeNS(null, 'abstract');
			if (isAbstract != '1' && isAbstract != 'true') {
				//elem.isMixed = schemaType.isMixed;
				this.processComplexType(schemaType, elem);
			} else {
				/*schemaType = this.getDerivedType(schemaType);
				if (schemaType) {
					//elem.xsiType = new QualifiedName(schemaType);
					this.processComplexType(schemaType, elem);
				}*/
			}
		} else { // simpleType
			var dataType = this.getSimpleDataType(schemaType);
			elem.valueGenerator = XmlValueGenerator.createGenerator(dataType, this.listLength, minOccurs);
		}
		elem.documentation = this.getDocumentation(schemaEl, globalDecl, this.isComplexType(schemaType) ? schemaType : null);
		return elem;
	},

	processComplexType: function(schemaType, elem) {
		if (this.isSimpleContent(schemaType)) {
			var dataType = this.getSimpleDataType(schemaType);
			elem.valueGenerator = XmlValueGenerator.createGenerator(dataType, this.listLength);
		} else {
			this.generateParticle(this.getContentTypeParticle(schemaType), elem);
		}
	},

	isSimpleContent: function(schemaType) {
		return typeof schemaType == 'string';
	},

	generateParticle: function(particle, iGrp) {
		if (!particle)
			return;

		var max = this.getMaxOccurs(particle);
		var min = this.getMinOccurs(particle);
		var occurs = this.getOccurs(min, max);

		if (particle.localName == 'sequence') {
			var grp = new InstanceGroup();
			grp.occurs = occurs;
			grp.minOccurs = min;
			grp.maxOccurs = max;
			iGrp.addChild(grp);
			this.generateGroupBase(particle, grp);
		} else if (particle.localName == 'choice') {
			if (max == 1) {
				var pt = this.getContentTypeParticle(particle);
				this.generateParticle(pt, iGrp);
			} else {
				var grp = new InstanceGroup();
				grp.occurs = occurs;
				grp.minOccurs = min;
				grp.maxOccurs = max;
				grp.isChoice = true;
				iGrp.addChild(grp);
				this.generateGroupBase(particle, grp);
			}
		} else if (particle.localName == 'all') {
			this.generateAll(particle, iGrp);
		} else if (particle.localName == 'element') {
			var ref = particle.getAttributeNS(null, 'ref');
			var ch;
			if (ref)
				ch = this.getSubstitutionChoice(particle);
			if (ch)
				this.generateParticle(ch, iGrp);
			else
				this.generateElement(particle, iGrp);
		} else if (particle.localName == 'complexContent') {
			var pt = this.getChildren(particle, 'extension', 'restriction')[0];
			if (pt) {
				var type = this.getSchemaType(pt, 'base');
				if (type)
					this.processComplexType(type, iGrp);
				this.processComplexType(pt, iGrp);
			}
		} else if (particle.localName == 'any') {
			this.generateAny(particle, iGrp);
		}
	},

	generateGroupBase: function(gBase, group) {
		var me = this;
		$.each(this.getParticles(gBase), function() {
			me.generateParticle(this, group);
		});
	},

	generateAll: function(gBase, group) {
		var me = this;
		$.each(this.getParticles(gBase), function() {
			me.generateParticle(this, group);
		});
	},

	generateAny: function(gBase, group) {
		group.addChild(new CommentElement('Any elements'));
	},

	getParticles: function(schemaType) {
		return this.getChildren(schemaType, 'choice', 'sequence', 'all', 'element', 'any', 'complexContent');
	},

	getContentTypeParticle: function(schemaType) {
		return this.getParticles(schemaType)[0];
	},

	getSimpleDataType: function(schemaType) {
		if (typeof schemaType == 'string')
			return schemaType;
		var children = this.getChildren(schemaType, 'restriction', 'list', 'union');
		var result = 'unknown';
		var me = this;
		$.each(children, function() {
			switch (this.localName) {
				case 'restriction':
					result = me.getSchemaType(this, 'base');
					return false;
				case 'list':
					result = me.getSchemaType(this, 'itemType');
					return false;
				case 'union':
					// TODO: asi rozdelit podla medzery a zobrat prvy typ
					result = me.getSchemaType(this, 'memberTypes');
					return false;
			}
		});
		return result;
	},

	isComplexType: function(schemaType) {
		return schemaType != null && schemaType.localName == 'complexType';
	},

	getSchemaType: function(el, attrName) {
		var type = el.getAttributeNS(null, attrName);
		if (type) {
			var typeNS = Wsdl._resolveNS(el, type);
			if (typeNS.ns == Wsdl.ns.schema)
				return typeNS.local;
			typeNS.localName = typeNS.local;
			typeNS.toString = function() { return this.full; };
			var globalType = this.findGlobalType(typeNS);
			return globalType;
		}
		var me = this;
		var schemaTypes = this.getChildren(el, 'complexType', 'simpleType');
		return schemaTypes[0];
	},

	getDocumentation: function() {
		var documentation = new Array;
		var me = this;
		for (var i = 0, n = arguments.length; i < n; ++i) {
			if (arguments[i] && arguments[i] != arguments[i - 1]) {
				$.each(me.getChildren(arguments[i], 'annotation'), function() {
					$.each(me.getChildren(this, 'documentation'), function() {
						documentation.push(this.textContent);
					});
				});
			}
		}
		return documentation.length ? documentation.join('\n') : undefined;
	},

	getOccurs: function(minOccurs, maxOccurs) {
		return minOccurs;
	},

	getMinOccurs: function(el) {
		var value = el.getAttributeNS(null, 'minOccurs');
		if (!value)
			return 1;
		var value = +value;
		if (isNaN(value))
			return 1;
		return value;
	},

	getMaxOccurs: function(el) {
		var value = el.getAttributeNS(null, 'maxOccurs');
		if (!value)
			return 1;
		if (value == 'unbounded')
			return Infinity;
		var value = +value;
		if (isNaN(value))
			return 1;
		return value;
	},

	getGlobalElements: function() {
		var result = new Array;
		var me = this;
		$.each(this.schemas, function() {
			var targetNS = this.getAttributeNS(null, 'targetNamespace');
			$.each(me.getChildren(this, 'element'), function() {
				var name = this.getAttributeNS(null, 'name');
				result[targetNS + ':' + name] = this;
			});
		});
		$.each(this.imports, function() {
			var importTargetNs = this.namespace || this.XML.documentElement.getAttributeNS(null, 'targetNamespace');
			$.each(me.getChildren(this.XML.documentElement, 'element'), function() {
				var name = this.getAttributeNS(null, 'name');
				result[importTargetNs + ':' + name] = this;
			});
		});
		return result;
	},

	getGlobalTypes: function() {
		var result = new Array;
		var me = this;
		$.each(this.schemas, function() {
			var targetNS = this.getAttributeNS(null, 'targetNamespace');
			$.each(me.getChildren(this, 'complexType', 'simpleType'), function() {
				var name = this.getAttributeNS(null, 'name');
				result[targetNS + ':' + name] = this;
			});
		});
		$.each(this.imports, function() {
			var importTargetNs = this.namespace || this.XML.documentElement.getAttributeNS(null, 'targetNamespace');
			$.each(me.getChildren(this.XML.documentElement, 'complexType', 'simpleType'), function() {
				var name = this.getAttributeNS(null, 'name');
				result[importTargetNs + ':' + name] = this;
			});
		});
		return result;
	},

	getSubstitutionChoice: function() {
		// TODO: implementation
		return null;
	},

	findGlobalType: function(qname) {
		var el = this.globalTypes[qname.ns + ':' + qname.localName];
		if (!el)
			return 'unknown type: ' + qname.localName;
			//throw new Error('No global type was found: ' + qname);
		return el;
	},

	findRootSchemaElement: function(root) {
		if (root) {
			var rootName = new XmlQualifiedName(root.ns, root.local);
			var el = this.globalElements[rootName.ns + ':' + rootName.localName]
			if (!el)
				throw new Error('No global element for root was found: ' + rootName);
		} else {
			for (var x in this.globalElements)
				if (this.globalElements.hasOwnProperty(x))
					if (!this.isAbstract(this.globalElements[x])) {
						el = this.globalElements[x];
						break;
					}
		}
		if (!el)
			throw new Error('No root element was found.');
		if (this.isAbstract(el))
			throw new Error('Root element type is abstract.');
		return el;
	},

	isAbstract: function(el) {
		var isAbstract = el.getAttributeNS(null, 'abstract');
		return isAbstract == 'true' || isAbstract == '1';
	},

	getChildren: function(el, _) {
		var ns = 'http://www.w3.org/2001/XMLSchema';
		var children = el.childNodes;
		var result = new Array;
		for (var i = 0, n = children.length; i < n; ++i) {
			var child = children[i];
			if (child.nodeType == 1 && child.namespaceURI == ns)
				for (var j = 1, m = arguments.length; j < m; ++j)
					if (child.localName == arguments[j])
						result.push(child);
		}
		return result;
	}
};

define({
	constructor: function InstanceAttribute() {
	}
});

define({
	constructor: function InstanceGroup() {
	},
	occurs: 1,
	isGroup: true,
	isChoice: false,
	parent: null,
	sibling: null,
	child: null,
	addChild: function(obj) {
		obj.parent = this;
		if (!this.child) {
			this.child = obj;
		} else {
			var prev = null;
			var next = this.child;
			while (next) {
				prev = next;
				next = next.sibling;
			}
			prev.sibling = obj;
		}
	}
});

define({
	constructor: function InstanceElement(qname) {
		this.id = ++InstanceElement.id;
		this.qname = qname;
		this.minOccurs = 1;
		this.maxOccurs = 1;
	},
	prototype: new InstanceGroup,
	static: {
		id: 0
	},
	isGroup: false,
	clone: function(occurs) {
		var newElem = new InstanceElement();
		for (var x in this)
			if (this.hasOwnProperty(x))
				newElem[x] = this[x];
		newElem.occurs = occurs;
		newElem.child = null;
		newElem.parent = null;
		newElem.sibling = null;
		return newElem;
	},
	toString: function() {
		return this.constructor.name + this.id;
	},
	isMixed: false,
	isNillable: false,
	genNil: true,
	xsiType: null,
	firstAttribute: null
});

define({
	constructor: function CommentElement(text) {
		this.id = ++CommentElement.id;
		this.documentation = ' ' + text + ' ';
	},
	prototype: InstanceElement,
	static: {
		id: 0
	},
	occurs: 1,
	toString: function() {
		return this.constructor.name + this.id;
	},
});

function define(name, props) {
	var ctor;
	var proto;
	var statics;
	if (typeof name != 'string') {
		props = name;
		name = props.constructor.name;
	}
	if (props.hasOwnProperty('constructor')) {
		ctor = props.constructor;
		delete props.constructor;
	} else
		ctor = function () {};
	if (props.hasOwnProperty('prototype')) {
		proto = props.prototype;
		delete props.prototype;
	} else
		proto = new Object;
	if (props.hasOwnProperty('static')) {
		statics = props.static;
		delete props.static;
	} else
		statics = new Object;
	for (var x in statics)
		if (statics.hasOwnProperty(x))
			ctor[x] = statics[x];
	for (var x in props)
		if (props.hasOwnProperty(x))
			proto[x] = props[x];
	ctor.prototype = proto;
	window[name] = ctor;
}
