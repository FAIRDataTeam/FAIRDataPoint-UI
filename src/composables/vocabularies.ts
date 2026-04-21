const DCT = 'http://purl.org/dc/terms/'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const DCAT = 'http://www.w3.org/ns/dcat#'
const LDP = 'http://www.w3.org/ns/ldp#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const FDP = 'https://w3id.org/fdp/fdp-o#'

export const DCT_TITLE = `${DCT}title`
export const DCT_DESCRIPTION = `${DCT}description`

export const RDF_TYPE = `${RDF}type`

export const prefixes: Record<string, string> = {
  [DCT]: 'dct',
  [RDF]: 'rdf',
  [RDFS]: 'rdfs',
  [XSD]: 'xsd',
  [OWL]: 'owl',
  [DCAT]: 'dcat',
  [LDP]: 'ldp',
  [FOAF]: 'foaf',
  [FDP]: 'fdp-o',
}
