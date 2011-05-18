/**
 * Basic content assist provides words proposal based on dictionary
 * @class
 * @param {Element} textarea Textarea element where you need to show content assist
 * @param {Array} words Proposals (strings)
 * @param {Object} [options] Options for <code>ContentAssist</code> object
 * 
 * @author Marcin Stefaniuk
 * @link http://eutechne.stefaniuk.info
 */function ConcreteContentAssist(textarea) {
	this.viewer = new TextViewer(textarea);
	this.processor = new ContentAssistProcessor();
	this.content_assist = new ContentAssist(this.viewer, this.processor);
}