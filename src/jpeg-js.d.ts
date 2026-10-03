declare module "jpeg-js" {
  export interface DecodedImage {
    data: Buffer;
    width: number;
    height: number;
  }
  export interface EncodeOptions {
    quality?: number;
  }
  export function decode(data: Buffer, options?: { maxMemoryUsageInMB?: number; maxResolutionInMP?: number }): DecodedImage;
  export function encode(image: DecodedImage, quality?: number): { data: Buffer };
  const def: {
    decode(data: Buffer, options?: { maxMemoryUsageInMB?: number; maxResolutionInMP?: number }): DecodedImage;
    encode(image: DecodedImage, quality?: number): { data: Buffer };
  };
  export default def;
}
