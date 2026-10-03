declare module "exif-parser" {
  export interface ExifTags {
    [key: string]: unknown;
    GPSLatitude?: number | number[];
    GPSLatitudeRef?: string;
    GPSLongitude?: number | number[];
    GPSLongitudeRef?: string;
    GPSAltitude?: number;
    DateTimeOriginal?: number;
    CreateDate?: number;
    Make?: string;
    Model?: string;
  }
  export interface ExifResult {
    tags: ExifTags;
    imageSize?: { height: number; width: number };
  }
  export interface Parser {
    parse(): ExifResult;
  }
  export function create(buffer: Buffer): Parser;
  const def: { create(buffer: Buffer): Parser };
  export default def;
}
