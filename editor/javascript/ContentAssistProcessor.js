/**
 * A content assist processor proposes completions and computes context 
 * information for a particular character offset. This interface is similar to
 * Eclipse's IContentAssistProcessor
 * @class
 * @author Marcin Stefaniuk
 * @link http://eutechne.stefaniuk.info
 * 
 * @include "TextViewer.js"
 * @include "CompletitionProposal.js"
 */
function ContentAssistProcessor() {
}

ContentAssistProcessor.prototype = {
	/**
	 * @param {TextViewer} viewer The viewer whose document is used to compute 
	 * the proposals
	 * @param {Number} offset An offset within the document for which 
	 * completions should be computed
	 * 
	 * @return {CompletitionProposal[]}
	 */
	computeCompletionProposals: function(viewer, offset) {
		
		var text = viewer.getContent();
		var proposals = [];
		
		var cursoredText = text.substring(0,offset)+"#"+text.substring(offset);
		
		contextParserConfig = {laxParsing: true, failOnCursor: false};
		try {
			// lax parsing of cursored text to get a entities and text before cursor
			var laxTree = contextParser.parse(cursoredText);
			var cursor = laxTree[laxTree.length-1]._cursor;
			
			try {
				// lax parsing failing on cursor to receive literal suggestions from parser
				contextParserConfig = {laxParsing: false, failOnCursor: true};
				contextParser.parse(cursoredText);
			} catch (e) {
				var failuresExpected = e.expectations.sort();
				if (failuresExpected.length > 0 && e.position == offset - cursor.length) {
					// error fits cursor position and suggest something
					
					var lastS = null;
					var includeEntityNames = false;
					
					for (var i = 0; i < failuresExpected.length; i++) {
						var s = failuresExpected[i];
						if (s.match(/^".+"$/) && lastS!==s && s.length > 3) {
							// literal suggestion with length more than one char
							var text = s.replace(/"/g, '');
							if (text=='' || text.indexOf(cursor)==0) {
								var proposal =
									this.completitionProposalFactory(	text,
																		offset - cursor.length,
																		cursor.length,
																		offset - cursor.length + text.length);
								proposals.push(proposal);
							}
						} else if (s=='EntityName') {
							includeEntityNames = true;
						} 
						lastS = s;
					}
					
					if (includeEntityNames) {
						for (var j=0; j<laxTree.length-1; j++) {
							var text = laxTree[j].name;
							if (laxTree[j]._class=='Class' && (text=='' || text.indexOf(cursor)==0)) {
								var proposal =
									this.completitionProposalFactory(	text,
																		offset - cursor.length,
																		cursor.length,
																		offset - cursor.length + text.length);
								proposals.push(proposal);
							}
						}
					}
				} else {
					// error appears earlier in text so only message is shown
					// $("#message").text(this.buildErrorMessage(e));
				}
			}
		} catch (seriousError) {
			// $("#message").text(this.buildErrorMessage(seriousError));
		}

		return proposals.length >0 ? proposals : null;
	},
	
	/**
	 * @param {String} str The actual string to be inserted into the document
	 * @param {Number} offset The offset of the text to be replaced
	 * @param {Number} length The length of the text to be replaced
	 * @param {Number} cursor The position of the cursor following the insert
	 * @return {CompletionProposal}
	 */
	completitionProposalFactory: function(str, offset, length, cursor) {
		return new CompletionProposal(str, offset, length, cursor);
	},
	
	buildErrorMessage:  function (e) {
    	return e.line !== undefined && e.column !== undefined
      		? "Line " + e.line + ", column " + e.column + ": " + e.message
      		: e.message;
  	}
}