var ConcreteExpression = {

  buildParser : function(template, concrete) {
    var ast = this.parser.parse(template);
    this.astbefore = ast;
    var model = concrete.modelRoot.childElements().collect( function(n) {
      return concrete.modelInterface.extractModel(n)
    }, concrete);
    var metamodel = new Concrete.MetamodelProvider(model);
    this.compiler.validate(ast, metamodel);
    this.compiler.enrich(ast, metamodel);
    this.compiler.vitalize(ast, metamodel);
    this.astafter = ast;
    return PEG.compiler.compile(ast);
  }
}

ConcreteExpression.astbefore = {};
ConcreteExpression.astafter = {};

ConcreteExpression.TemplateError = function(message) {
  this.name = "ConcreteExpression.TemplateError";
  this.message = message;
};
ConcreteExpression.TemplateError.prototype = Error.prototype;

ConcreteExpression.compiler = {

  validate : function(ast, model) {

    function nop() {
    }

    function validateRule(node) {
      if (model.metaclassesByName[node.name] == undefined) {
        throw new ConcreteExpression.TemplateError(
            "Metamodel has no class named '" + node.name + "'.");
      } else if (model.metaclassesByName[node.name].abstract == true) {
        throw new ConcreteExpression.TemplateError(
            "You should not define template for abstract class '" + node.name
                + "' - it is automatically handled.");
      }
    }

    function validateRuleReference(node) {
      if (model.metaclassesByName[node.name] == undefined
          && ConcreteExpression.base.rules[node.name] == undefined) {
        throw new ConcreteExpression.TemplateError(
            "Metamodel has no class named '" + node.name + "'.");
      }
    }

    function visitExpression(node) {
      visit(node.expression);
    }

    function visitSubnodes(propertyName) {
      return function(node) {
        each(node[propertyName], visit);
      };
    }

    var visit = buildNodeVisitor( {
      grammar : function(node) {
        var startRule = node.startRule;
        for ( var name in node.rules) {
          visit(node.rules[name]);
        }
        model.metaclassesByName[startRule].subTypes.each( function(rule) {
          if (rule.abstract == false && node.rules[rule.name] == undefined) {
            throw new ConcreteExpression.TemplateError(
                "Not all subclasses of '" + startRule
                    + "' has defined template - '" + rule.name
                    + "' is missing.");
          }
        });
      },

      rule : validateRule,
      choice : visitSubnodes("alternatives"),
      sequence : visitSubnodes("elements"),
      labeled : visitExpression,
      simple_and : nop,
      simple_not : nop,
      semantic_and : nop,
      semantic_not : nop,
      optional : visitExpression,
      zero_or_more : visitExpression,
      one_or_more : visitExpression,
      action : nop,
      rule_ref : validateRuleReference,
      literal : nop,
      any : nop,
      "class" : nop
    });

    visit(ast);
  },

  enrich : function(ast, model) {

    var sequence = 0;
    var clazz;

    function nop() {
    }

    function visitExpression(node) {
      visit(node.expression);
    }

    function visitSubnodes(propertyName) {
      return function(node) {
        each(node[propertyName], visit);
      };
    }

    function addLabel(node) {
      node.expression = Object.clone(node);
      node.type = "labeled";
      node.label = 'id' + sequence++;
      if (node.expression.expression)
        visit(node.expression.expression);
    }

    function addRuleOfAlternatives(name, alternatives) {
      ast.rules[name] = {
        type : "rule",
        name : name,
        displayName : null,
        expression : {
          type : "choice",
          alternatives : alternatives
        }
      }
    }

    function addProxyToBaseRule(name, target) {
      ast.rules[name] = {
        type : "rule",
        name : name,
        displayName : null,
        expression : {
          type : "rule_ref",
          name : target
        }
      }
    }

    var visit = buildNodeVisitor( {
      grammar : function(node) {
        for ( var name in node.rules) {
          visit(node.rules[name]);
        }
      },

      rule : function(node) {
        if (model.metaclassesByName[node.name] != undefined) {
          clazz = model.metaclassesByName[node.name];
        } else {
          clazz = undefined;
        }
        visit(node.expression);
      },

      choice : visitSubnodes("alternatives"),
      sequence : visitSubnodes("elements"),
      labeled : function(node) {
        node._feature = node.label;
        node.label = 'id' + sequence++;
        if (node.expression.type == "rule_ref" && clazz != undefined) {
          var refs = clazz.features.findAll( function(n) {
            return n.name == node._feature;
          });
          if (refs.size() == 1 && refs.entries()[0].kind == 'reference') {
            node.expression.name = '_reference';
          }
        }
        visit(node.expression);
      },

      simple_and : visitExpression,
      simple_not : visitExpression,
      semantic_and : nop,
      semantic_not : nop,
      optional : addLabel,
      zero_or_more : addLabel,
      one_or_more : addLabel,
      action : visitExpression,

      rule_ref : function(node) {
        if (model.metaclassesByName[node.name] != undefined) {
          var clazz = model.metaclassesByName[node.name];
          if (clazz.abstract == true && ast.rules[node.name] == undefined) {
            addRuleOfAlternatives(node.name, clazz.subTypes.map( function(
                element) {
              return {
                type : "rule_ref",
                name : element.name
              }
            }));
            visit(ast.rules[node.name]);
          } else if (ast.rules[node.name] == undefined
              && clazz.features.size() == 1
              && clazz.features.entries()[0].type._class == 'Datatype') {
            addProxyToBaseRule(clazz.name, '_integer');
          }
          clazz.features.each( function(feature) {
            if (ast.rules[feature.type.name] == undefined) {
              if (feature.type._class == 'Enum') {
                addRuleOfAlternatives(feature.type.name, feature.type.literals
                    .map( function(element) {
                      return {
                        type : "literal",
                        value : element,
                        ignoreCase : false
                      }
                    }));
              }
            }
          });
        }
      },

      literal : addLabel,
      any : nop,
      "class" : nop
    });

    visit(ast);
  },

  vitalize : function(ast, model) {

    function nop() {
    }

    function visitExpression(node) {
      visit(node.expression);
    }

    function visitSubnodes(propertyName) {
      return function(node) {
        each(node[propertyName], visit);
      };
    }

    /* Adds JSON generation for sequences */
    function addAction(node) {
      if (node.expression.type == 'sequence') {
        var expression = Object.clone(node.expression)
        node.expression = {};
        node.expression.type = "action";
        var list = "["
            + expression.elements
                .map(
                    function(element) {
                      if (element.expression !== undefined
                          && [ 'zero_or_more', 'one_or_more', 'optional' ]
                              .indexOf(element.expression.type) >= 0) {
                        return element.label;
                      } else if (element.type == 'labeled') {
                        return "{"
                            + (element.expression.type == 'literal' ? "type:'literal',"
                                : "type:'feature',name:'" + element._feature
                                    + "',") + "value:" + element.label + "}";
                      }
                    }).reject( function(element) {
                  return element == undefined || element.length == 0
                }).join(',') + "]";

        if (node.type == 'rule') {
          node.expression.code = "return c('" + node.name + "'," + list + ")";
        } else
          node.expression.code = "return " + list;
        node.expression.expression = expression;
      }
      visit(node.expression);
    }

    var visit = buildNodeVisitor( {
      grammar : function(node) {
        for ( var name in node.rules) {
          visit(node.rules[name]);
        }
        node.initializer = ConcreteExpression.base.initializer;
        Object.extend(node.rules, ConcreteExpression.base.rules);
      },

      rule : addAction,
      choice : visitSubnodes("alternatives"),
      sequence : visitSubnodes("elements"),
      labeled : visitExpression,
      simple_and : visitExpression,
      simple_not : visitExpression,
      semantic_and : nop,
      semantic_not : nop,
      optional : addAction,
      zero_or_more : addAction,
      one_or_more : addAction,
      action : visitExpression,
      rule_ref : nop,
      literal : nop,
      any : nop,
      "class" : nop
    });

    visit(ast);
  }
}

ConcreteExpression.base = {
  initializer : {
    type : "initializer",
    code : "function c(name, features) {\n" + "  var clazz = {_class: name};\n"
        + "  features = features.flatten();\n"
        + "  if (features.length==1) return features[0].value;\n"
        + "  features.reject(function(e){return e.type=='literal'})"
        + "    .each(function(f) {\n"
        + "      if (!clazz.hasOwnProperty(f.name)) {\n"
        + "        clazz[f.name]=f.value;\n"
        + "      } else if (clazz[f.name] instanceof Array) {\n"
        + "        clazz[f.name].push(f.value);\n"
        + "      } else {clazz[f.name]=[clazz[f.name], f.value]}\n" + "  });\n"
        + "    return clazz;\n" + "}"
  },

  rules : {
    "_" : {
      "type" : "rule",
      "name" : "_",
      "displayName" : "WS",
      "expression" : {
        "type" : "zero_or_more",
        "expression" : {
          "type" : "class",
          "inverted" : false,
          "ignoreCase" : false,
          "parts" : [ " " ],
          "rawText" : "[ ]"
        }
      }
    },
    "__" : {
      "type" : "rule",
      "name" : "__",
      "displayName" : "WS",
      "expression" : {
        "type" : "one_or_more",
        "expression" : {
          "type" : "class",
          "inverted" : false,
          "ignoreCase" : false,
          "parts" : [ " " ],
          "rawText" : "[ ]"
        }
      }
    },
    "_integer" : {
      "type" : "rule",
      "name" : "_integer",
      "displayName" : null,
      "expression" : {
        "type" : "action",
        "expression" : {
          "type" : "labeled",
          "label" : "i",
          "expression" : {
            "type" : "one_or_more",
            "expression" : {
              "type" : "class",
              "inverted" : false,
              "ignoreCase" : false,
              "parts" : [ [ "0", "9" ] ],
              "rawText" : "[0-9]"
            }
          }
        },
        "code" : "return parseInt(i.join(''), 10);"
      }
    },
    "_reference" : {
      "type" : "rule",
      "name" : "_reference",
      "displayName" : null,
      "expression" : {
        "type" : "action",
        "expression" : {
          "type" : "labeled",
          "label" : "r",
          "expression" : {
            "type" : "one_or_more",
            "expression" : {
              "type" : "action",
              "expression" : {
                "type" : "sequence",
                "elements" : [ {
                  "type" : "literal",
                  "value" : "/",
                  "ignoreCase" : false
                }, {
                  "type" : "labeled",
                  "label" : "r",
                  "expression" : {
                    "type" : "one_or_more",
                    "expression" : {
                      "type" : "class",
                      "inverted" : false,
                      "ignoreCase" : false,
                      "parts" : [ [ "A", "Z" ], [ "a", "z" ] ],
                      "rawText" : "[A-Za-z]"
                    }
                  }
                } ]
              },
              "code" : "return '/'+r.join('')"
            }
          }
        },
        "code" : "return r.join('')"
      }
    }
  }
}