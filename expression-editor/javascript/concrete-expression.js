var ConcreteExpression = {

  createGrammar : function(template, concrete) {
    var ast = this.parser.parse(template);
    this.compiler.enrich(ast, concrete);
    this.compiler.finalize(ast, concrete);
    return ast;
//    return PEG.compiler.compile(ast);
  }
}

ConcreteExpression.compiler = {

  enrich : function(ast, concrete) {
  
    var sequence = 0;

    function nop() {}

    function visitExpression(node) { visit(node.expression); }

    function visitSubnodes(propertyName) {
      return function(node) { each(node[propertyName], visit); };
    }

    function addLabel(node) {
      node.expression = Object.clone(node);
      node.type = "labeled";
      node.label = 'id'+sequence++;
      visit(node.expression.expression);
    }
    
    var visit = buildNodeVisitor({
      grammar:
        function(node) {
          for (var name in node.rules) {
            visit(node.rules[name]);
          }
        },

      rule:         visitExpression,
      choice:       visitSubnodes("alternatives"),
      sequence:     visitSubnodes("elements"),
      labeled:
        function (node) {
          node._feature = node.label;
          node.label = 'id'+sequence++;
        },
        
      simple_and:   visitExpression,
      simple_not:   visitExpression,
      semantic_and: nop,
      semantic_not: nop,
      optional:     addLabel,
      zero_or_more: addLabel,
      one_or_more:  addLabel,
      action:       visitExpression,
      rule_ref:     nop,
      literal:      nop,
      any:          nop,
      "class":      nop
    });

    visit(ast);
  },

  finalize : function(ast, concrete) {
    
    function nop() {}

    function visitExpression(node) { visit(node.expression); }

    function visitSubnodes(propertyName) {
      return function(node) { each(node[propertyName], visit); };
    }
    
    /* Adds JSON generation for sequences */
    function addAction(node) {
      if (node.expression.type=='sequence') {
        var expression = Object.clone(node.expression)
        node.expression = {};
        node.expression.type = "action";
        if (node.type=='rule') {
          node.expression.code = "return c('"+node.name+"',"+
          map(expression.elements, function(element) {
            if (element.type=='labeled') {
              return "{name:'"+element._feature+"', value:"+element.label+"}";
            }
            }).join(',')+")";
        } else node.expression.code = "return c";
        node.expression.expression = expression;
      }
      visit(node.expression);
    }
    
    var visit = buildNodeVisitor({
      grammar:
        function(node) {
          for (var name in node.rules) {
            visit(node.rules[name]);
          }
          node.initializer = {
          type: "initializer",
          code:
            "function c(name, features) {\n"+
            "  var clazz = {_class: name};\n"+
            "  if (features.length==1) return features[0].value;\n"+
            "  for (f in features) {\n"+
            "    if (!clazz.hasOwnProperty(features[f].name)) {\n"+
            "      clazz[features[f].name]=features[f].value;\n"+
            "    } else if (clazz[features[f].name] instanceof Array) {\n"+
            "      clazz[features[f].name].push(features[f].value);\n"+
            "    } else {clazz[features[f].name]=[clazz[features[f].name], features[f].value]}\n"+
            "  }\n"+
            "  return clazz;\n"+
            "}"
          };
        },

      rule:         addAction,
      choice:       visitSubnodes("alternatives"),
      sequence:     visitSubnodes("elements"),
      labeled:      visitExpression,
      simple_and:   visitExpression,
      simple_not:   visitExpression,
      semantic_and: nop,
      semantic_not: nop,
      optional:     addAction,
      zero_or_more: addAction,
      one_or_more:  addAction,
      action:       visitExpression,
      rule_ref:     nop,
      literal:      nop,
      any:          nop,
      "class":      nop
    });

    visit(ast);
  }
}