0.0.0.13
	- Better XML recognition (works with XML Tree extension now)
0.0.0.12
	- SOAP headers support
	- Optional simple elements are marked with questionmark
	- Compressed CSS
	- Small tweaks
0.0.0.11
	- XSD imports are not downloaded to show the popup as they are not needed
0.0.0.10
	- Displays title in the editor tab
0.0.0.9
	- Support for RPC style
	- Relative URLs support form XSD imports
	- Automated tests
	- Fixed issues for Chrome 22
0.0.0.8
	- Fixed typo
0.0.0.7
	- Handle missing schema information
	- Support multiple schema elements in WSDL
	- Better RPC type handling
0.0.0.6
	- Complex types handling
0.0.0.5
	- Content-Type header sent correctly for SOAP 1.1 and 1.2
0.0.0.4
	- Handled no endpoint set
0.0.0.3
	- Fixed invalid JSZip.js reference
0.0.0.2
	- Second upload
0.0.0.1
	- First upload
	
TODO:
	- wsdl:import
	- settings for editor (tab size, themes, line numbers, ...)
	- download as local (modify references so the WSDL can be imported locally)
	- optional output formatting
	- GET, POST
	- RPC type
	- namespace table
	- autocomplete

XSD include: http://www.predic8.com:8080/material/ArticleService?wsdl
XSD type extension: http://www.predic8.com:8080/crm/CustomerService?wsdl
XSD optional: http://www.bccs.uni.no/~pve002/wsdls/ebi-mafft.wsdl
HTTP port: http://www.thomas-bayer.com/axis2/services/BLZService?wsdl