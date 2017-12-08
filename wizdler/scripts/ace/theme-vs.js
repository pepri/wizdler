define('ace/theme/vs', ['require', 'exports', 'module', 'ace/lib/dom'],
function(require, exports, module){

exports.cssClass = 'ace-vs';
exports.cssText = "\
.ace-vs.ace_editor, .ace-vs .ace_text-layer {\
  font-size: 14px;\
  line-height: 16px;\
}\
.platform-win32 .ace-vs.ace_editor, .platform-win32 .ace-vs .ace_text-layer {\
  font-size: 13px;\
  line-height: 16px;\
}\
.platform-mac .ace-vs.ace_editor, .platform-mac .ace-vs .ace_text-layer {\
  font-size: 12px;\
  line-height: normal;\
}\
\
.ace-vs .ace_editor.ace_focus {\
  border: 2px solid #327fbd;\
}\
\
.ace-vs .ace_gutter {\
  width: 50px;\
  background: #fff;\
  border-right: 1px solid #eee;\t \
  color: #2b91af;\
}\
\
.ace-vs .ace_gutter-layer {\
  width: 100%;\
  text-align: right;\
}\
\
.ace-vs .ace_gutter-layer .ace_gutter-cell {\
  padding-right: 6px;\
}\
\
.ace-vs .ace_text-layer {\
  cursor: text;\
}\
\
.ace-vs .ace_cursor {\
  border-left: 1px solid black;\
}\
\
.ace-vs .ace_line .ace_keyword, .ace-vs .ace_line .ace_variable {\
  color: #00f;\
}\
\
.ace-vs .ace_line .ace_constant {\
  color: #00f;\
}\
.ace-vs .ace_line .ace_constant.ace_buildin {\
  color: #2b91af;\
}\
\
.ace-vs .ace_line .ace_constant.ace_library {\
  color: #2b91af;\
}\
\
.ace-vs .ace_line .ace_function {\
  color: #000;\
}\
\
.ace-vs .ace_line .ace_string {\
  color: #a31515;\
}\
\
.ace-vs .ace_line .ace_comment {\
  color: #008000;\
}\
\
.ace-vs .ace_line .ace_comment.ace_doc {\
  color: #808080;\
}\
\
.ace-vs .ace_line .ace_comment.ace_doc.ace_tag {\
  color: #808080;\
}\
\
.ace-vs .ace_line .ace_constant.ace_numeric {\
}\
\
.ace-vs .ace_line .ace_tag {\
\tcolor: rgb(128,0,0);\
}\
.ace-vs .ace_line .ace_entity {\
\tcolor: rgb(255,0,0);\
}\
.ace-vs .ace_line .ace_string {\
\tcolor: rgb(0,0,255);\
}\
\
.ace-vs .ace_line .ace_xml_pe {\
  color: #f00;\
}\
\
.ace-vs .ace_marker-layer .ace_selection {\
  background: #cad5f2;\
}\
\
.ace-vs .ace_marker-layer .ace_bracket {\
  margin: -1px 0 0 -1px;\
  font-weight: bold;\
  background: #eee;\
  border: 1px solid #ccc;\
}\
\
.ace-vs .ace_marker-layer .ace_active_line {\
  background: #fafafa;\
}";

	var dom = require('../lib/dom');
	dom.importCssString(exports.cssText, exports.cssClass);
})
