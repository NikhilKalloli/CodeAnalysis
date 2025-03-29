const comprehensiveQueryString = `
; --- Declarations ---

(function_declaration
  name: (identifier) @function_name
  parameters: (formal_parameters) @function_params
  return_type: (_)? @function_return_type
  body: (statement_block) @function_body) @function_definition

(class_declaration
  name: (type_identifier) @class_name
  (extends_clause 
    (_) @extended_class)? 
  (implements_clause 
    (_) @implemented_interface)? 
  body: (class_body) @class_body) @class_definition

(abstract_class_declaration
  name: (type_identifier) @abstract_class_name
  (extends_clause 
    (_) @extended_class)? 
  (implements_clause 
    (_) @implemented_interface)? 
  body: (class_body) @class_body) @abstract_class_definition

(method_definition
  name: (property_identifier) @method_name
  parameters: (formal_parameters) @method_params
  return_type: (_)? @return_type
  body: (statement_block) @method_body) @method_definition

(public_field_definition
  name: (property_identifier) @class_prop_name
  type: (_)? @class_prop_type) @class_property

(interface_declaration
  name: (type_identifier) @interface_name
  (extends_clause
    (_) @extended_interface)?
  body: (object_type) @interface_body) @interface_definition

(type_alias_declaration
  name: (type_identifier) @type_alias_name
  value: (_) @type_alias_value) @type_alias_definition

(enum_declaration
  name: (identifier) @enum_name
  body: (enum_body) @enum_body) @enum_definition

; --- Variables & Assignments ---

(lexical_declaration
  (variable_declarator
    name: (_) @variable_name
    type: (_)? @variable_type
    value: (_)? @variable_value)) @variable_declaration

(variable_declaration
  (variable_declarator
    name: (_) @variable_name
    value: (_)? @variable_value)) @variable_declaration_legacy

(assignment_expression
  left: (_) @assign_target
  right: (_) @assign_value) @assignment

; --- Function/Method Calls ---

(call_expression
  function: (identifier) @called_function
  arguments: (arguments) @call_arguments) @call_expression

(call_expression
  function: (member_expression
    object: (_) @caller_object
    property: (property_identifier) @called_method)
  arguments: (arguments) @call_arguments) @method_call_expression

; --- Imports ---

(import_statement
  source: (string) @import_source
  (import_clause)? @import_clause) @import_statement

(import_clause 
  (identifier) @default_import)

(import_clause
  (named_imports
    (import_specifier
      name: (identifier) @named_import
      alias: (identifier)? @import_alias)))

(import_clause
  (namespace_import 
    (identifier) @namespace_import))

; --- Exports ---

(export_statement
  declaration: (_) @exported_declaration) @export_declaration_statement

(export_statement
  (export_clause 
    (export_specifier 
      name: (identifier) @exported_name)) 
  source: (string)? @export_source) @export_named_statement

(export_statement
  value: (_) @export_default_value) @export_default_statement

; --- Control Flow ---

(if_statement
  condition: (_) @if_condition
  consequence: (_) @if_consequence
  alternative: (else_clause)? @if_alternative) @if_statement

(for_statement) @for_loop
(while_statement) @while_loop

; --- Types ---

(type_annotation
  type: (_) @type_value) @type_annotation

(type_annotation
  type: (type_identifier) @type_identifier)

(type_annotation
  type: (union_type) @union_type) 

(type_annotation
  type: (intersection_type) @intersection_type)

(generic_type
  type: (_) @generic_base
  type_arguments: (type_arguments) @generic_args) @generic_type

; --- Literals and Expressions ---

(string) @string_literal
(number) @number_literal
(true) @boolean_literal_true
(false) @boolean_literal_false
(null) @null_literal

; --- Comments ---
(comment) @comment
`; 