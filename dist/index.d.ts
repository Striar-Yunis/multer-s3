import { ObjectCannedACL, S3Client, ServerSideEncryption, StorageClass } from "@aws-sdk/client-s3";
import { Readable } from "stream";
type Option<T> = T | OptionAwaitable<T> | OptionCallback<T>;
type OptionAwaitable<T> = (req: Express.Request, file: Express.Multer.File) => Promise<T>;
type OptionCallback<T> = (req: Express.Request, file: Express.Multer.File, cb: Callback<T>) => void;
type Callback<T> = (error: Error | null, value?: T) => void;
export interface S3StorageOptions {
    acl?: Option<ObjectCannedACL>;
    bucket: Option<string>;
    cacheControl?: Option<string>;
    contentDisposition?: Option<string>;
    contentEncoding?: Option<string>;
    contentType?: Option<string>;
    key?: Option<string>;
    metadata?: Option<{
        [key: string]: string;
    }>;
    serverSideEncryption?: Option<ServerSideEncryption>;
    sseKmsKeyId?: Option<string>;
    storageClass?: Option<StorageClass>;
    s3: S3Client;
}
declare class S3Storage {
    getAcl: OptionAwaitable<ObjectCannedACL>;
    getBucket: OptionAwaitable<string>;
    getCacheControl: OptionAwaitable<string | undefined>;
    getContentDisposition: OptionAwaitable<string | undefined>;
    getContentEncoding: OptionAwaitable<string | undefined>;
    getContentType: OptionAwaitable<string>;
    getKey: OptionAwaitable<string>;
    getMetadata: OptionAwaitable<{
        [key: string]: string;
    } | undefined>;
    getServerSideEncryption: OptionAwaitable<ServerSideEncryption | undefined>;
    getSseKmsKeyId: OptionAwaitable<string | undefined>;
    getStorageClass: OptionAwaitable<StorageClass | undefined>;
    s3: S3Client;
    constructor(opts: S3StorageOptions);
    private standardizeOptions;
    private collect;
    _handleFile(req: Express.Request, file: Express.Multer.File, cb: (error?: any, info?: Partial<Express.Multer.File> & {
        acl: ObjectCannedACL;
        bucket: string;
        etag?: string;
        key: string;
        contentDisposition?: string;
        contentEncoding?: string;
        contentType: string;
        location?: string;
        metadata?: {
            [key: string]: string;
        };
        serverSideEncryption?: ServerSideEncryption;
        storageClass?: StorageClass;
        versionId?: string;
    }) => void): Promise<void>;
    _removeFile(req: Express.Request, file: Express.Multer.File & {
        bucket: string;
        key: string;
    }, cb: (error?: Error) => void): Promise<void>;
}
export default function (opts: S3StorageOptions): S3Storage;
type ContentTypeCallback = (error: Error | null, mime: string, replacementStream: Readable) => void;
declare function autoContentType(req: Express.Request, file: Express.Multer.File, cb: ContentTypeCallback): void;
export declare const AUTO_CONTENT_TYPE: typeof autoContentType;
export declare const DEFAULT_CONTENT_TYPE: (req: Express.Request, file: Express.Multer.File, cb: Callback<any>) => void;
export {};
