import {
  DeleteObjectCommand,
  ObjectCannedACL,
  PutObjectCommandInput,
  S3Client,
  ServerSideEncryption,
  StorageClass,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { randomBytes } from "crypto";
import htmlCommentRegex from "html-comment-regex";
import stream, { Readable } from "stream";
import { promisify } from "util";

const randomBytesAsync = promisify(randomBytes);

const defaultContentType = "application/octet-stream";

async function defaultKey(_: Express.Request, __: Express.Multer.File) {
  const raw = await randomBytesAsync(16);
  return raw.toString("hex");
}

declare global {
  namespace Express {
    namespace MulterS3 {
      interface File extends Multer.File {
        acl: ObjectCannedACL;
        bucket: string;
        etag?: string;
        key: string;
        contentDisposition?: string;
        contentEncoding?: string;
        contentType: string;
        location?: string;
        metadata?: { [key: string]: string };
        serverSideEncryption?: ServerSideEncryption;
        size: number;
        storageClass?: StorageClass;
        tagging?: string;
        versionId?: string;
      }
    }
  }
}

// Allows for a static, awaitable, or callback option
type Option<T> = T | OptionAwaitable<T> | OptionCallback<T>;
type OptionAwaitable<T> = (
  req: Express.Request,
  file: Express.Multer.File
) => Promise<T>;
type OptionCallback<T> = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: Callback<T>
) => void;
type Callback<T> = (error: Error | null, value?: T) => void;

export interface S3StorageOptions {
  acl?: Option<ObjectCannedACL>;
  bucket: Option<string>;
  cacheControl?: Option<string>;
  contentDisposition?: Option<string>;
  contentEncoding?: Option<string>;
  contentType?: Option<string>;
  key?: Option<string>;
  metadata?: Option<{ [key: string]: string }>;
  partSize?: Option<number>;
  serverSideEncryption?: Option<ServerSideEncryption>;
  sseKmsKeyId?: Option<string>;
  storageClass?: Option<StorageClass>;
  s3: S3Client;
  tagging?: Option<string>;
}

class S3Storage {
  getAcl: OptionAwaitable<ObjectCannedACL>;
  getBucket: OptionAwaitable<string>;
  getCacheControl: OptionAwaitable<string | undefined>;
  getContentDisposition: OptionAwaitable<string | undefined>;
  getContentEncoding: OptionAwaitable<string | undefined>;
  getContentType: OptionAwaitable<string>;
  getKey: OptionAwaitable<string>;
  getMetadata: OptionAwaitable<{ [key: string]: string } | undefined>;
  getPartSize: OptionAwaitable<number | undefined>;
  getServerSideEncryption: OptionAwaitable<ServerSideEncryption | undefined>;
  getSseKmsKeyId: OptionAwaitable<string | undefined>;
  getStorageClass: OptionAwaitable<StorageClass | undefined>;
  s3: S3Client;
  getTagging: OptionAwaitable<string | undefined>;

  constructor(opts: S3StorageOptions) {
    this.getAcl = this.standardizeOptions(opts.acl || "private");
    this.getBucket = this.standardizeOptions(opts.bucket);
    this.getCacheControl = this.standardizeOptions(
      opts.cacheControl || undefined
    );
    this.getContentDisposition = this.standardizeOptions(
      opts.contentDisposition || undefined
    );
    this.getContentEncoding = this.standardizeOptions(
      opts.contentEncoding || undefined
    );
    this.getContentType = this.standardizeOptions(
      opts.contentType || defaultContentType
    );
    this.getKey = this.standardizeOptions(opts.key || defaultKey);
    this.getMetadata = this.standardizeOptions(opts.metadata || undefined);
    this.getPartSize = this.standardizeOptions(opts.partSize || undefined);
    this.getServerSideEncryption = this.standardizeOptions(
      opts.serverSideEncryption || undefined
    );
    this.getSseKmsKeyId = this.standardizeOptions(
      opts.sseKmsKeyId || undefined
    );
    this.getStorageClass = this.standardizeOptions(
      opts.storageClass || "STANDARD"
    );
    this.getTagging = this.standardizeOptions(opts.tagging || undefined);
    this.s3 = opts.s3;
  }

  // Convert all option types to a standard async function
  private standardizeOptions<T>(
    option: Option<T>
  ): (req: Express.Request, file: Express.Multer.File) => Promise<T> {
    return (req: Express.Request, file: Express.Multer.File): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        if (typeof option === "function") {
          if (option.length >= 3) {
            // It's a callback-based function: (req, file, cb)
            (option as OptionCallback<T>)(req, file, (error, value) => {
              if (error) {
                reject(error);
              } else {
                resolve(value as T);
              }
            });
          } else {
            // It's an async function: (req, file) => T | Promise<T>
            try {
              const result = (option as OptionAwaitable<T>)(req, file);
              Promise.resolve(result).then(resolve).catch(reject);
            } catch (error) {
              reject(error);
            }
          }
        } else {
          // It's a static value: T or Promise<T>
          Promise.resolve(option).then(resolve).catch(reject);
        }
      });
    };
  }

  private async collect(req: Express.Request, file: Express.Multer.File) {
    // Start all the option retrievals concurrently
    const [
      acl,
      bucket,
      cacheControl,
      contentDisposition,
      contentEncoding,
      contentType,
      key,
      metadata,
      partSize,
      serverSideEncryption,
      sseKmsKeyId,
      storageClass,
      tagging,
    ] = await Promise.all([
      this.getAcl(req, file),
      this.getBucket(req, file),
      this.getCacheControl(req, file),
      this.getContentDisposition(req, file),
      this.getContentEncoding(req, file),
      this.getContentType(req, file),
      this.getKey(req, file),
      this.getMetadata(req, file),
      this.getPartSize(req, file),
      this.getServerSideEncryption(req, file),
      this.getSseKmsKeyId(req, file),
      this.getStorageClass(req, file),
      this.getTagging(req, file),
    ]);

    // Return an object containing all the collected options
    return {
      acl,
      bucket,
      cacheControl,
      contentDisposition,
      contentEncoding,
      contentType,
      key,
      metadata,
      partSize,
      serverSideEncryption,
      sseKmsKeyId,
      storageClass,
      tagging,
    };
  }

  async _handleFile(
    req: Express.Request,
    file: Express.Multer.File,
    cb: (
      error?: any,
      info?: Partial<Express.Multer.File> & {
        acl: ObjectCannedACL;
        bucket: string;
        etag?: string;
        key: string;
        contentDisposition?: string;
        contentEncoding?: string;
        contentType: string;
        location?: string;
        metadata?: { [key: string]: string };
        serverSideEncryption?: ServerSideEncryption;
        storageClass?: StorageClass;
        tagging?: string;
        versionId?: string;
      }
    ) => void
  ): Promise<void> {
    try {
      const opts = await this.collect(req, file);
      // Build the S3 upload parameters
      const params: PutObjectCommandInput = {
        ACL: opts.acl,
        Body: file.stream,
        Bucket: opts.bucket,
        CacheControl: opts.cacheControl,
        ContentDisposition: opts.contentDisposition,
        ContentEncoding: opts.contentEncoding,
        ContentType: opts.contentType,
        Key: opts.key,
        Metadata: opts.metadata,
        ServerSideEncryption: opts.serverSideEncryption,
        SSEKMSKeyId: opts.sseKmsKeyId,
        StorageClass: opts.storageClass,
        Tagging: opts.tagging,
      };

      const upload = new Upload({
        client: this.s3,
        params,
        partSize: opts.partSize,
      });

      let currentSize = 0;
      upload.on("httpUploadProgress", function (ev) {
        if (ev.total) currentSize = ev.total;
      });

      const result = await upload.done();

      cb(null, {
        acl: opts.acl,
        bucket: opts.bucket,
        etag: result.ETag,
        key: opts.key,
        contentDisposition: opts.contentDisposition,
        contentEncoding: opts.contentEncoding,
        contentType: opts.contentType,
        location: result.Location,
        metadata: opts.metadata,
        serverSideEncryption: opts.serverSideEncryption,
        size: currentSize,
        storageClass: opts.storageClass,
        tagging: opts.tagging,
        versionId: result.VersionId,
      });
    } catch (error) {
      cb(error);
    }
  }

  async _removeFile(
    req: Express.Request,
    file: Express.Multer.File & { bucket: string; key: string },
    cb: (error: Error | null) => void
  ) {
    try {
      this.s3.send(
        new DeleteObjectCommand({
          Bucket: file.bucket,
          Key: file.key,
        })
      );
      cb(null);
    } catch (error: any) {
      cb(error);
    }
  }
}

export default function (opts: S3StorageOptions) {
  return new S3Storage(opts);
}

// Maintain compatibility with the original module -------------------------------------------------------------------------------
function staticValue(value: any) {
  return function (
    _: Express.Request,
    __: Express.Multer.File,
    cb: Callback<any>
  ) {
    cb(null, value);
  };
}

// Regular expression to detect svg file content, inspired by: https://github.com/sindresorhus/is-svg/blob/master/index.js
// It is not always possible to check for an end tag if a file is very big. The firstChunk, see below, might not be the entire file.
var svgRegex = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*>\s*)?<svg[^>]*>/i;

function isSvg(svg: string) {
  // Remove DTD entities
  svg = svg.replace(/\s*<!Entity\s+\S*\s*(?:"|')[^"]+(?:"|')\s*>/gim, "");
  // Remove DTD markup declarations
  svg = svg.replace(/\[?(?:\s*<![A-Z]+[^>]*>\s*)*\]?/g, "");
  // Remove HTML comments
  svg = svg.replace(htmlCommentRegex, "");

  return svgRegex.test(svg);
}

type ContentTypeCallback = (
  error: Error | null,
  mime: string,
  replacementStream: Readable
) => void;

function autoContentType(
  req: Express.Request,
  file: Express.Multer.File,
  cb: ContentTypeCallback
) {
  file.stream.once("data", async function (firstChunk: Buffer) {
    const { fileTypeFromBuffer } = await import("file-type"); // Support commonjs....

    var type = await fileTypeFromBuffer(firstChunk);
    var mime = "application/octet-stream"; // default type

    // Make sure to check xml-extension for svg files.
    if (type && type.ext === "xml" && isSvg(firstChunk.toString())) {
      mime = "image/svg+xml";
    } else if (type) {
      mime = type.mime;
    }

    var outStream = new stream.PassThrough();

    outStream.write(firstChunk);
    file.stream.pipe(outStream);

    cb(null, mime, outStream);
  });
}

export const AUTO_CONTENT_TYPE = autoContentType;
export const DEFAULT_CONTENT_TYPE = staticValue(defaultContentType);
