setTimeout(function() {
	var ns = {
		wsdl: 'http://schemas.xmlsoap.org/wsdl/',
		xhtml: 'http://www.w3.org/1999/xhtml'
	};

	var xmlContent = getXmlContent();

	if (xmlContent) {
		var parser = new DOMParser;
		var doc = parser.parseFromString(xmlContent, 'text/xml');
		var root = doc.documentElement;
		if (root.namespaceURI == ns.wsdl && root.localName == 'definitions') {
			if (chrome.runtime) {
				chrome.runtime.onMessage.addListener(onMessage);
				chrome.runtime.sendMessage({
					command: 'showPageAction'
				});
			}
		}
	}

	function getXmlContent() {
		switch (document.documentElement.namespaceURI) {
			case ns.wsdl:
				return new XMLSerializer().serializeToString(document);
			case ns.xhtml:
				var el;
				if (el = document.getElementById('webkit-xml-viewer-source-xml')) {
					return el.innerHTML;
				} else if (el = document.querySelector('body>pre')) {
					if (!el.nextSibling && !el.previousSibling) {
						var textOnly = true;
						for (var i = 0, n = el.childNodes.length; i < n; ++i)
							if (el.childNodes[i].nodeType != 3) {
								textOnly = false;
								break;
							}
						if (textOnly)
							return el.textContent;
					}
				} else if (el = document.querySelector('body>#tree')) { // XML Tree extension
					return el.textContent;
				}
		}
		return null;
	}

	function downloadFile(name, data) {
		var a = document.createElementNS(ns.xhtml, 'a');
		a.download = name;
		a.href = data;
		var ev = document.createEvent('MouseEvents');
		ev.initEvent('click', true, true);
		a.dispatchEvent(ev);
	}

	function onMessage(request, sender, sendResponse) {
		switch (request.command) {
			case 'getXml':
				sendResponse(xmlContent);
				break;
			case 'download':
				downloadFile(request.name, request.data);
				sendResponse();
				break;
			default:
				sendResponse();
		}
	}
}, 200);
