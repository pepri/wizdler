var ns = {
	wsdl: 'http://schemas.xmlsoap.org/wsdl/',
	xhtml: 'http://www.w3.org/1999/xhtml'
};
var xmlContent;
switch (document.documentElement.namespaceURI) {
	case ns.wsdl:
		xmlContent = new XMLSerializer().serializeToString(document);
		break;
	case ns.xhtml:
		var xmlSource = document.getElementById('webkit-xml-viewer-source-xml');
		if (xmlSource)
			xmlContent = xmlSource.innerHTML;
		break;
	default:
		xmlContent = null;
}

if (xmlContent) {
	var parser = new DOMParser;
	var doc = parser.parseFromString(xmlContent, 'text/xml');
	var root = doc.documentElement;
	if (root.namespaceURI == ns.wsdl && root.localName == 'definitions') {
		if (!chrome.extension)
			return;
		chrome.extension.onRequest.addListener(onRequest);
		chrome.extension.sendRequest({
			command: 'showPageAction'
		});
	}
}

function downloadFile(name, data) {
	var a = document.createElementNS(ns.xhtml, 'a');
	a.download = name;
	a.href = data;
	var ev = document.createEvent('MouseEvents');
	ev.initEvent('click', true, true);
	a.dispatchEvent(ev);
}

function onRequest(request, sender, sendResponse) {
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
