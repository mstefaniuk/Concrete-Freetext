{
	var laxParsing = (typeof contextParserConfig === 'undefined' ? true: contextParserConfig.laxParsing);
	var failOnCursor = (typeof contextParserConfig === 'undefined' ? false: contextParserConfig.failOnCursor);
	
	var primitives = [];
	var cursor;
}

start
  = Definition

Definition = s:Sentences
	{var p=[];
	for (var i=0; i<primitives.length; i++)
		p.push({"_class": "Datatype", "name": primitives[i]});
	s = s.concat(p)
	if (cursor !== undefined) s.push(cursor);
	return s}

Sentences = (_ s:Sentence _ {return s})+
Sentence =  EnumerationSentence / ClassSentence / LaxSentence

LaxSentence = &{return laxParsing}
	c:ClassName (__ WordOrCursor)* "."?
	{return {"_class" : "Class", "name" : c}}
WordOrCursor =  Cursor / AnyWord
Cursor = !{return failOnCursor}
	f:QName? "#"
	{cursor = {"_cursor": f}}
AnyWord = (!("." / __ / "#") .)+

EnumerationSentence = c:ClassName __ ENUMERATION e:EnumerationValues? "."
	{s = {"_class": "Enum", "name": c};
		if (e) s["literals"] = e;
		return s;} 
EnumerationValues = __ WITH __ VALUES __ f:QName l:(_ "," _ q:QName {return q})*
	{return [f].concat(l);}

ClassSentence = c:ClassName a:Abstract? e:Extends? f:Features? "."
	{var s={"_class" : "Class", "name" : c};
	if (f) s["features"] = f;
	if (e) s["superTypes"] = e;
	if (a) s["abstract"] = true;
	return s}
Abstract = __ ABSTRACT

Extends = __ EXTENDS __ e:EntityName
	{return e}
Features = __ f1:Feature f2:(_ "," _ f3:Feature {return f3})*
	{if (f2.length != 0) {
		var r=[f1];
		for (var i=0; i<f2.length; i++)
			{r.push(f2[i])};
	} else {
		var r=f1;
	}
	return r}
Feature = Attribute / Containment / Reference

Attribute = HAS feature:Multiplicity n:FeatureName __ AS __ p:Primitive
	{if ($.inArray(p, primitives)) {primitives.push(p);};
	feature["kind"] = "attribute";
	feature["name"] = n;
	feature["type"] = p;
	return feature}
Containment = CONTAINS feature:Multiplicity n:FeatureName __ AS __ e:EntityName
	{feature["kind"] = "containment";
	feature["name"] = n;
	feature["type"] = e;
	return feature}
Reference = HAS feature:Multiplicity n:FeatureName __ REFERRING __ e:EntityName
	{feature["kind"] = "reference";
	feature["name"] = n;
	feature["type"] = e;
	return feature}

Multiplicity = (AnyNumber / Between / Exact / UnlimitedFrom / Optional / Obligatory)
AnyNumber = __ "any number of" __
	{return {"_class" : "Feature", "lowerLimit" : 0, "upperLimit" : -1}}
Between = __ "from" __ f:Number __ "to" __ t:Number __ "of" __
	{return {"_class" : "Feature", "lowerLimit" : f, "upperLimit" : t}}
Exact = __ "exactly" __ n:Number __ "of" __
	{return {"_class" : "Feature", "lowerLimit" : n, "upperLimit" : n}}
UnlimitedFrom = __ "at least" __ f:Number __ "of" __
	{return {"_class" : "Feature", "lowerLimit" : f, "upperLimit" : -1}}
Optional = __ "optional" __
	{return {"_class" : "Feature", "lowerLimit" : 0, "upperLimit" : 1}}
Obligatory = __ "obligatory" __
	{return {"_class" : "Feature", "lowerLimit" : 1, "upperLimit" : 1}}

ENUMERATION = "is enumeration"
WITH = "with"
VALUES = "values"
ABSTRACT = "is abstract"
EXTENDS = "extends"
HAS = "has"
AS = "as"
CONTAINS = "contains"
REFERRING = "referring to"

Number = n:([0-9]+) {return parseInt(n.join(""), 10);}

Primitive = p:("string" / "integer" / "float" / "boolean")
	{return p.substr(0,1).toUpperCase()+p.substr(1)}
FeatureName = QName
ClassName = QName

EntityName "EntityName" = Name / LongName
QName "QName" = Name / LongName
LongName = "'" Name (" "+ Name)+ "'" / '"' f:Name s:(" "+ t:Name {return " "+t})+ '"' {return f+s.join('')}
Name "Name" = c:[A-Za-z] d:[A-Za-z0-9]* {return c+d.join('')}
_ "WS" = [ \n\r]*
__ "WS" = [ \n\r]+

HighlightingRules = Keyword / Identifier / Occurence
Keyword "keyword" = ENUMERATION / WITH / VALUES / ABSTRACT / EXTENDS / HAS / AS / CONTAINS / REFERRING
Identifier "identifier" = EntityName / FeatureName
Occurence "occurence" = Multiplicity