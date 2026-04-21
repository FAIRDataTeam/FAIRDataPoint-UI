const DCT = 'http://purl.org/dc/terms/'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const DCAT = 'http://www.w3.org/ns/dcat#'
const LDP = 'http://www.w3.org/ns/ldp#'
const FOAF = 'http://xmlns.com/foaf/0.1/'
const FDP = 'https://w3id.org/fdp/fdp-o#'
const RE3DATA = 'http://www.re3data.org/schema/3-0#'
const PROF = 'http://www.w3.org/ns/dx/prof/'
const SH = 'http://www.w3.org/ns/shacl#'
const PROV = 'http://www.w3.org/ns/prov#'
const ODRL = 'http://www.w3.org/ns/odrl/2/'
const DASH = 'http://datashapes.org/dash#'
const SIO = 'http://semanticscience.org/resource/'

// Dublin Core Terms
export const DCT_TITLE = `${DCT}title`
export const DCT_DESCRIPTION = `${DCT}description`
export const DCT_IS_PART_OF = `${DCT}isPartOf`
export const DCT_CONFORMS_TO = `${DCT}conformsTo`
export const DCT_LANGUAGE = `${DCT}language`
export const DCT_LICENSE = `${DCT}license`
export const DCT_ISSUED = `${DCT}issued`
export const DCT_MODIFIED = `${DCT}modified`
export const DCT_HAS_VERSION = `${DCT}hasVersion`
export const DCT_FORMAT = `${DCT}format`
export const DCT_IDENTIFIER = `${DCT}identifier`
export const DCT_PUBLISHER = `${DCT}publisher`
export const DCT_RIGHTS = `${DCT}rights`
export const DCT_ACCESS_RIGHTS = `${DCT}accessRights`

// RDF / RDFS
export const RDF_TYPE = `${RDF}type`
export const RDFS_LABEL = `${RDFS}label`

// XSD
export const XSD_DATE = `${XSD}date`
export const XSD_DATETIME = `${XSD}dateTime`

// DCAT
export const DCAT_CATALOG = `${DCAT}catalog`
export const DCAT_DATASET = `${DCAT}dataset`
export const DCAT_DISTRIBUTION = `${DCAT}distribution`
export const DCAT_THEME = `${DCAT}theme`
export const DCAT_THEME_TAXONOMY = `${DCAT}themeTaxonomy`
export const DCAT_VERSION = `${DCAT}version`
export const DCAT_ENDPOINT_URL = `${DCAT}endpointURL`
export const DCAT_LANDING_PAGE = `${DCAT}landingPage`
export const DCAT_CONTACT_POINT = `${DCAT}contactPoint`
export const DCAT_KEYWORD = `${DCAT}keyword`
export const DCAT_ACCESS_URL = `${DCAT}accessURL`
export const DCAT_DOWNLOAD_URL = `${DCAT}downloadURL`
export const DCAT_MEDIA_TYPE = `${DCAT}mediaType`
export const DCAT_BYTE_SIZE = `${DCAT}byteSize`
export const DCAT_SERVES_DATASET = `${DCAT}servesDataset`
export const DCAT_ENDPOINT_DESCRIPTION = `${DCAT}endpointDescription`

// LDP
export const LDP_DIRECT_CONTAINER = `${LDP}DirectContainer`
export const LDP_CONTAINS = `${LDP}contains`
export const LDP_MEMBERSHIP_RESOURCE = `${LDP}membershipResource`
export const LDP_HAS_MEMBER_RELATION = `${LDP}hasMemberRelation`

// FOAF
export const FOAF_NAME = `${FOAF}name`
export const FOAF_HOMEPAGE = `${FOAF}homepage`

// FDP
export const FDP_METADATA_ISSUED = `${FDP}metadataIssued`
export const FDP_METADATA_MODIFIED = `${FDP}metadataModified`
export const FDP_METADATA_IDENTIFIER = `${FDP}metadataIdentifier`
export const FDP_METADATA_CATALOG = `${FDP}metadataCatalog`
export const FDP_SOFTWARE_VERSION = `${FDP}fdpSoftwareVersion`
export const FDP_START_DATE = `${FDP}startDate`
export const FDP_END_DATE = `${FDP}endDate`
export const FDP_UI_LANGUAGE = `${FDP}uiLanguage`

// RE3DATA
export const RE3DATA_REPOSITORY_IDENTIFIER = `${RE3DATA}repositoryIdentifier`

// PROF
export const PROF_IS_PROFILE_OF = `${PROF}isProfileOf`
export const PROF_HAS_RESOURCE = `${PROF}hasResource`
export const PROF_HAS_ROLE = `${PROF}hasRole`
export const PROF_HAS_ARTIFACT = `${PROF}hasArtifact`

// SHACL
export const SHACL_IRI = `${SH}IRI`
export const SHACL_NODE_SHAPE = `${SH}NodeShape`
export const SHACL_TARGET_CLASS = `${SH}targetClass`
export const SHACL_PROPERTY = `${SH}property`
export const SHACL_PATH = `${SH}path`
export const SHACL_DATATYPE = `${SH}datatype`
export const SHACL_NODE_KIND = `${SH}nodeKind`
export const SHACL_MIN_COUNT = `${SH}minCount`
export const SHACL_MAX_COUNT = `${SH}maxCount`
export const SHACL_NAME = `${SH}name`
export const SHACL_ORDER = `${SH}order`

// PROV
export const PROV_WAS_GENERATED_BY = `${PROV}wasGeneratedBy`
export const PROV_QUALIFIED_ATTRIBUTION = `${PROV}qualifiedAttribution`

// ODRL
export const ODRL_HAS_POLICY = `${ODRL}hasPolicy`

// SIO
export const SIO_IS_ABOUT = `${SIO}SIO_000628`
export const SIO_IS_RELATED_TO = `${SIO}SIO_000332`

// DASH
export const DASH_VIEWER = `${DASH}viewer`
export const DASH_URI_VIEWER = `${DASH}URIViewer`

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
  [RE3DATA]: 're3data',
  [PROF]: 'prof',
  [SH]: 'sh',
  [PROV]: 'prov',
  [ODRL]: 'odrl',
  [DASH]: 'dash',
  [SIO]: 'sio',
}
