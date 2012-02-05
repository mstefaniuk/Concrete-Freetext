var ConcreteExpression = {

  buildParser : function(template, concrete) {
    var ast = this.parser.parse(template);
    var model = concrete.modelRoot.childElements().collect(function(n){return concrete.modelInterface.extractModel(n)},concrete);
    var metamodel = new Concrete.MetamodelProvider(model);
    this.compiler.enrich(ast, metamodel);
    this.compiler.validate(ast, metamodel);
//    this.compiler.complete(ast, metamodel);
    this.compiler.vitalize(ast, metamodel);
    this.model = ast;
    return ast;
//    return PEG.compiler.compile(ast);
  }
}

ConcreteExpression.model = {}

ConcreteExpression.TemplateError = function(message) {
  this.name = "ConcreteExpression.TemplateError";
  this.message = message;
};
ConcreteExpression.TemplateError.prototype = Error.prototype;

ConcreteExpression.compiler = {

  enrich : function(ast, model) {
  
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

  
  validate : function(ast, model) {
    
    function nop() {}

    function validateRule(node) {
      if (model.metaclassesByName[node.name]==undefined) {
        throw new ConcreteExpression.TemplateError(
            "Metamodel has no class named '" +node.name+"'."
          );
      } else if (model.metaclassesByName[node.name].abstract==true) {
        throw new ConcreteExpression.TemplateError(
            "You should not define template for abstract class '" +node.name+"' - it is automatically handled."
          );
      }
    }

    function visitExpression(node) { visit(node.expression); }

    function visitSubnodes(propertyName) {
      return function(node) { each(node[propertyName], visit); };
    }

    var visit = buildNodeVisitor({
      grammar:
        function(node) {
          var startRule = node.startRule;
          for (var name in node.rules) {
            visit(node.rules[name]);
          }
          model.metaclassesByName[startRule].subTypes.each(function(rule){
            if (rule.abstract==false && node.rules[rule.name]==undefined) {
              throw new ConcreteExpression.TemplateError(
                "Not all subclasses of '"+startRule+"' has defined template - '"+rule.name+"' is missing."
              );
            }
          });
        },

      rule:         validateRule,
      choice:       visitSubnodes("alternatives"),
      sequence:     visitSubnodes("elements"),
      labeled:      nop,
      simple_and:   nop,
      simple_not:   nop,
      semantic_and: nop,
      semantic_not: nop,
      optional:     nop,
      zero_or_more: nop,
      one_or_more:  nop,
      action:       nop,
      rule_ref:     nop,
      literal:      nop,
      any:          nop,
      "class":      nop
    });

    visit(ast);
  },

  
  vitalize : function(ast, model) {
    
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
        var list = "["+
          expression.elements
            .map(function(element) {
              if (element.expression!==undefined
                  && ['zero_or_more','one_or_more','optional'].indexOf(element.expression.type)>=0) {
                return element.label;
              } else if (element.type=='labeled') {
                return "{name:'"+element._feature+"', value:"+element.label+"}";
              }})
            .reject(function(element) {return element==undefined || element.length==0})
            .join(',') + "]";

        if (node.type=='rule') {
          node.expression.code = "return c('"+node.name+"',"+ list + ")";
        } else node.expression.code = "return "+list;
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
              "  features = features.flatten();\n"+
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

          node.rules["_"] = {
             "type": "rule",
             "name": "_",
             "displayName": "WS",
             "expression": {
                "type": "zero_or_more",
                "expression": {
                   "type": "class",
                   "inverted": false,
                   "ignoreCase": false,
                   "parts": [" "],
                   "rawText": "[ ]"
                }
             }
          };
          node.rules["__"] = {
             "type": "rule",
             "name": "__",
             "displayName": "WS",
             "expression": {
                "type": "one_or_more",
                "expression": {
                   "type": "class",
                   "inverted": false,
                   "ignoreCase": false,
                   "parts": [" "],
                   "rawText": "[ ]"
                }
             }
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