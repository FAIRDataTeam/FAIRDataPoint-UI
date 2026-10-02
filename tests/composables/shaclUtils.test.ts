import { describe, it, expect } from 'vitest'
import { parseTurtle } from '../../src/composables/rdfUtils'
import { getShapePropertyMap, getEditableFields } from '../../src/composables/shaclUtils'
import {
  DCT_TITLE,
  DCT_PUBLISHER,
  DCT_LICENSE,
  DCT_ISSUED,
  SHACL_NODE_SHAPE,
  SHACL_TARGET_CLASS,
  SHACL_PROPERTY,
  SHACL_PATH,
  SHACL_NAME,
  SHACL_DATATYPE,
  SHACL_ORDER,
  SHACL_NODE,
  SHACL_MIN_COUNT,
  SHACL_MAX_COUNT,
  DASH_EDITOR,
  DASH_VIEWER,
  DASH_LABEL_VIEWER,
} from '../../src/composables/vocabularies'

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'

describe('getShapePropertyMap', () => {
  const RESOURCE = 'http://localhost/catalog/c1'
  const CATALOG = 'http://www.w3.org/ns/dcat#Catalog'
  const TEXT_FIELD_EDITOR = 'http://datashapes.org/dash#TextFieldEditor'
  const URI_EDITOR = 'http://datashapes.org/dash#URIEditor'
  const AGENT_SHAPE = 'http://fairdatapoint.org/AgentShape'
  const BLANK_NODE_EDITOR = 'http://datashapes.org/dash#BlankNodeEditor'
  const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'

  const resourceStore = () => parseTurtle(`<${RESOURCE}> a <${CATALOG}> .`)

  /** A NodeShape targeting dcat:Catalog, with the given property-shape bodies. */
  const shapeGraph = (...properties: string[]) =>
    parseTurtle(`
      <http://ex/Shape${properties.length}> a <${SHACL_NODE_SHAPE}> ;
        <${SHACL_TARGET_CLASS}> <${CATALOG}> ;
        ${properties.map((body) => `<${SHACL_PROPERTY}> [ ${body} ]`).join(' ;\n')} .
    `)

  it('reads the SHACL and DASH attributes an edit form needs', () => {
    const shape = shapeGraph(`
      <${SHACL_PATH}> <${DCT_TITLE}> ;
      <${SHACL_NAME}> "Title" ;
      <${SHACL_ORDER}> 1 ;
      <${SHACL_DATATYPE}> <${XSD_STRING}> ;
      <${SHACL_MIN_COUNT}> 1 ;
      <${SHACL_MAX_COUNT}> 1 ;
      <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}> ;
      <${DASH_VIEWER}> <${DASH_LABEL_VIEWER}>
    `)
    expect(getShapePropertyMap(resourceStore(), RESOURCE, [shape]).get(DCT_TITLE)).toEqual({
      path: DCT_TITLE,
      label: 'Title',
      order: 1,
      viewer: DASH_LABEL_VIEWER,
      editor: TEXT_FIELD_EDITOR,
      nodeKind: null,
      datatype: XSD_STRING,
      node: null,
      minCount: 1,
      maxCount: 1,
      nested: new Map(),
    })
  })

  it('reads sh:node for a property whose value is its own record', () => {
    const shape = shapeGraph(`
      <${SHACL_PATH}> <${DCT_PUBLISHER}> ;
      <${SHACL_NODE}> <${AGENT_SHAPE}>
    `)
    expect(
      getShapePropertyMap(resourceStore(), RESOURCE, [shape]).get(DCT_PUBLISHER),
    ).toMatchObject({
      node: AGENT_SHAPE,
      order: Number.MAX_SAFE_INTEGER,
      minCount: null,
      maxCount: null,
    })
  })

  it('merges shapes constraining the same path, keeping the strictest cardinality', () => {
    const loose = shapeGraph(`
      <${SHACL_PATH}> <${DCT_TITLE}> ;
      <${SHACL_ORDER}> 1 ;
      <${SHACL_MIN_COUNT}> 0 ;
      <${SHACL_MAX_COUNT}> 5 ;
      <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}>
    `)
    const strict = shapeGraph(`
      <${SHACL_PATH}> <${DCT_TITLE}> ;
      <${SHACL_ORDER}> 9 ;
      <${SHACL_NAME}> "Only the stricter shape names it" ;
      <${SHACL_MIN_COUNT}> 2 ;
      <${SHACL_MAX_COUNT}> 3
    `)
    expect(getShapePropertyMap(resourceStore(), RESOURCE, [loose, strict]).get(DCT_TITLE)).toEqual({
      path: DCT_TITLE,
      label: 'Only the stricter shape names it',
      order: 1,
      viewer: null,
      editor: TEXT_FIELD_EDITOR,
      nodeKind: null,
      datatype: null,
      node: null,
      minCount: 2,
      maxCount: 3,
      nested: new Map(),
    })
  })

  it('picks hints by shacl:order, whichever order the shapes are read in', () => {
    const unhinted = shapeGraph(`<${SHACL_PATH}> <${DCT_TITLE}> ; <${SHACL_ORDER}> 1`)
    const later = shapeGraph(`
      <${SHACL_PATH}> <${DCT_TITLE}> ;
      <${SHACL_ORDER}> 9 ;
      <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}>
    `)
    const earlier = shapeGraph(`
      <${SHACL_PATH}> <${DCT_TITLE}> ;
      <${SHACL_ORDER}> 5 ;
      <${DASH_EDITOR}> <${URI_EDITOR}>
    `)

    for (const shapes of [
      [unhinted, later, earlier],
      [unhinted, earlier, later],
    ]) {
      expect(getShapePropertyMap(resourceStore(), RESOURCE, shapes).get(DCT_TITLE)).toMatchObject({
        order: 1,
        editor: URI_EDITOR,
      })
    }
  })

  it('treats an absent bound as no constraint when merging', () => {
    const unbounded = shapeGraph(`<${SHACL_PATH}> <${DCT_TITLE}> ; <${SHACL_ORDER}> 1`)
    const bounded = shapeGraph(`
      <${SHACL_PATH}> <${DCT_TITLE}> ;
      <${SHACL_ORDER}> 2 ;
      <${SHACL_MAX_COUNT}> 1
    `)
    expect(
      getShapePropertyMap(resourceStore(), RESOURCE, [unbounded, bounded]).get(DCT_TITLE),
    ).toMatchObject({ minCount: null, maxCount: 1 })
  })

  it('ignores shapes that target a class the resource does not have', () => {
    const shape = parseTurtle(`
      <http://ex/DatasetShape> a <${SHACL_NODE_SHAPE}> ;
        <${SHACL_TARGET_CLASS}> <http://www.w3.org/ns/dcat#Dataset> ;
        <${SHACL_PROPERTY}> [ <${SHACL_PATH}> <${DCT_TITLE}> ; <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}> ] .
    `)
    expect(getShapePropertyMap(resourceStore(), RESOURCE, [shape]).size).toBe(0)
  })

  it("resolves sh:node into the referenced shape's own properties", () => {
    const shapes = parseTurtle(`
      <http://ex/Shape1> a <${SHACL_NODE_SHAPE}> ;
        <${SHACL_TARGET_CLASS}> <${CATALOG}> ;
        <${SHACL_PROPERTY}> [
          <${SHACL_PATH}> <${DCT_PUBLISHER}> ;
          <${SHACL_NODE}> <${AGENT_SHAPE}> ;
          <${DASH_EDITOR}> <${BLANK_NODE_EDITOR}>
        ] .
      <${AGENT_SHAPE}> a <${SHACL_NODE_SHAPE}> ;
        <${SHACL_TARGET_CLASS}> <http://xmlns.com/foaf/0.1/Agent> ;
        <${SHACL_PROPERTY}> [
          <${SHACL_PATH}> <${FOAF_NAME}> ;
          <${SHACL_MIN_COUNT}> 1 ;
          <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}>
        ] .
    `)
    const publisher = getShapePropertyMap(resourceStore(), RESOURCE, [shapes]).get(DCT_PUBLISHER)
    expect([...(publisher?.nested.keys() ?? [])]).toEqual([FOAF_NAME])
    expect(publisher?.nested.get(FOAF_NAME)).toMatchObject({
      minCount: 1,
      editor: TEXT_FIELD_EDITOR,
    })
  })

  it('stops following sh:node at the depth limit rather than looping', () => {
    // A shape that references itself would recurse forever without the bound.
    const shapes = parseTurtle(`
      <http://ex/Shape1> a <${SHACL_NODE_SHAPE}> ;
        <${SHACL_TARGET_CLASS}> <${CATALOG}> ;
        <${SHACL_PROPERTY}> [ <${SHACL_PATH}> <${DCT_PUBLISHER}> ; <${SHACL_NODE}> <${AGENT_SHAPE}> ] .
      <${AGENT_SHAPE}> a <${SHACL_NODE_SHAPE}> ;
        <${SHACL_PROPERTY}> [ <${SHACL_PATH}> <${DCT_PUBLISHER}> ; <${SHACL_NODE}> <${AGENT_SHAPE}> ] .
    `)
    let level = getShapePropertyMap(resourceStore(), RESOURCE, [shapes]).get(DCT_PUBLISHER)
    let depth = 0
    while (level && level.nested.size > 0) {
      level = level.nested.get(DCT_PUBLISHER)
      depth += 1
    }
    expect(depth).toBe(2)
  })

  describe('getEditableFields', () => {
    it('offers only properties with a dash:editor, in shacl:order', () => {
      // Mirrors the live catalog shapes: dct:issued is displayed but the backend owns it.
      const shape = shapeGraph(
        `<${SHACL_PATH}> <${DCT_ISSUED}> ;
         <${SHACL_ORDER}> 20 ;
         <${DASH_VIEWER}> <${DASH_LABEL_VIEWER}>`,
        `<${SHACL_PATH}> <${DCT_LICENSE}> ;
         <${SHACL_ORDER}> 6 ;
         <${DASH_EDITOR}> <${URI_EDITOR}> ;
         <${DASH_VIEWER}> <${DASH_LABEL_VIEWER}>`,
        `<${SHACL_PATH}> <${DCT_TITLE}> ;
         <${SHACL_ORDER}> 1 ;
         <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}>`,
      )
      expect(
        getEditableFields(getShapePropertyMap(resourceStore(), RESOURCE, [shape])).map(
          (f) => f.path,
        ),
      ).toEqual([DCT_TITLE, DCT_LICENSE])
    })

    it('sorts properties without shacl:order last', () => {
      const shape = shapeGraph(
        `<${SHACL_PATH}> <${DCT_PUBLISHER}> ; <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}>`,
        `<${SHACL_PATH}> <${DCT_TITLE}> ; <${SHACL_ORDER}> 1 ; <${DASH_EDITOR}> <${TEXT_FIELD_EDITOR}>`,
      )
      expect(
        getEditableFields(getShapePropertyMap(resourceStore(), RESOURCE, [shape])).map(
          (f) => f.path,
        ),
      ).toEqual([DCT_TITLE, DCT_PUBLISHER])
    })
  })
})
