export type Coordinate = [number, number];

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: Coordinate[][];
};

export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: Coordinate[][][];
};

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

export type DistrictFeature = {
  type: "Feature";
  properties: {
    adcode?: number;
    name: string;
    center?: Coordinate;
    centroid?: Coordinate;
    source?: string;
    osmId?: number;
  };
  geometry: AreaGeometry;
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: DistrictFeature[];
};

export type RoadFeature = {
  id: string;
  name: string | null;
  ref: string | null;
  level: 1 | 2;
  roadClass: string;
  coordinates: Coordinate[];
};

export type WaterFeature = {
  id: string;
  name: string | null;
  kind: "line" | "area";
  waterClass: string;
  coordinates: Coordinate[];
};

export type TransitLine = {
  id: string;
  relationId: number;
  name: string;
  ref: string | null;
  color: string;
  coordinates: Coordinate[];
};

export type TransitStation = {
  id: string;
  name: string;
  coordinate: Coordinate;
  lineRefs?: string[];
};

export type SurfaceFeature = {
  id: string;
  name: string | null;
  surfaceClass: string;
  geometry: AreaGeometry;
  labelCoordinate: Coordinate;
};

export type TransitRoute = {
  id: string;
  ref: string;
  name: string;
  color: string;
  stops: TransitStation[];
};

export type BasemapData = {
  roads: RoadFeature[];
  water: WaterFeature[];
  waterAreas: SurfaceFeature[];
  landcover: SurfaceFeature[];
  surfaceUpdatedAt?: string;
  transitLines: TransitLine[];
  transitStations: TransitStation[];
  transitRoutes: TransitRoute[];
};

export type Category = {
  id: string;
  label: string;
  color: string;
};

export type PlaceImage = {
  url: string;
  sourceName: string;
  sourceUrl: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  caption?: string;
};

export type Place = {
  id: string;
  name: string;
  aliases: string[];
  pinyin: string;
  pinyinInitials: string;
  coordinate: Coordinate;
  region: string;
  category: string;
  tags: string[];
  library: "core" | "extended";
  priority: 1 | 2 | 3;
  encyclopedia: string;
  recommendation: string;
  opening: string;
  price: string;
  nearestTransit: string;
  images: PlaceImage[];
  source: {
    name: string;
    url: string;
    license: string;
  };
  sourceUpdatedAt: string;
  verificationStatus: "source-linked" | "osm-only";
  officialUrl: string | null;
  score: number;
  contentUpdatedAt?: string;
  visitGuide?: { duration: string; highlights: string[]; access: string };
  contentSources?: Array<{ name: string; url: string; license?: string; checkedAt?: string }>;
};

export type PlacesData = {
  categories: Category[];
  places: Place[];
};

export type RegionMeta = {
  name: string;
  tags: string[];
  landmarks: string[];
  character: string;
  description: string;
  image: PlaceImage | null;
};

export type RegionsData = {
  updatedAt: string;
  regions: RegionMeta[];
};

export type TransportConfig = {
  referenceTime: string;
  walkingSpeedKmh: number;
  subwayWaitMinutes: number;
  busWaitMinutes: number;
  suburbanBusWaitMinutes: number;
  conventionalRailBufferMinutes: number;
  highSpeedRailBufferMinutes: number;
  drivingSpeedKmh: {
    urban: number;
    suburban: number;
    expressway: number;
  };
  disclaimer: string;
};
