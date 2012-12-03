var xmlSource = document.getElementById('webkit-xml-viewer-source-xml');
if (xmlSource) {
	var App = {

		ns: {
			wsdl: 'http://schemas.xmlsoap.org/wsdl/',
			xhtml: 'http://www.w3.org/1999/xhtml'
		},

		run: function() {
			this.xml = xmlSource.innerHTML;
			var parser = new DOMParser;
			var doc = parser.parseFromString(this.xml, 'text/xml');
			var root = doc.documentElement;
			if (root.namespaceURI == App.ns.wsdl && root.localName == 'definitions') {
				if (!chrome.extension)
					return;
				chrome.extension.onRequest.addListener(this.bind('onRequest'));
				chrome.extension.sendRequest({
					command: 'showPageAction'
				});
			}
		},

		bind: function(name) {
			var me = this;
			return function() {
				me[name].apply(me, arguments);
			};
		},

		downloadFile: function(name, data) {
			var a = document.createElementNS(App.ns.xhtml, 'a');
			a.download = name;
			a.href = data;
			var ev = document.createEvent('MouseEvents');
			ev.initEvent('click', true, true);
			a.dispatchEvent(ev);
		},

		onRequest: function(request, sender, sendResponse) {
			switch (request.command) {
				case 'getXml':
					sendResponse(this.xml);
					break;
				case 'download':
					this.downloadFile(request.name, request.data);
					sendResponse();
					break;
				default:
					sendResponse();
			}
		}
	};
	App.run();
}

