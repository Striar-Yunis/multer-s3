"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONTENT_TYPE = exports.AUTO_CONTENT_TYPE = void 0;
exports.default = default_1;
const client_s3_1 = require("@aws-sdk/client-s3");
const lib_storage_1 = require("@aws-sdk/lib-storage");
const crypto_1 = require("crypto");
const file_type_1 = require("file-type");
const html_comment_regex_1 = __importDefault(require("html-comment-regex"));
const stream_1 = __importDefault(require("stream"));
const util_1 = require("util");
const randomBytesAsync = (0, util_1.promisify)(crypto_1.randomBytes);
const defaultContentType = "application/octet-stream";
function defaultKey(_, __) {
    return __awaiter(this, void 0, void 0, function* () {
        const raw = yield randomBytesAsync(16);
        return raw.toString("hex");
    });
}
class S3Storage {
    constructor(opts) {
        this.s3 = opts.s3;
        this.getAcl = this.standardizeOptions(opts.acl || "private");
        this.getBucket = this.standardizeOptions(opts.bucket);
        this.getCacheControl = this.standardizeOptions(opts.cacheControl || undefined);
        this.getContentDisposition = this.standardizeOptions(opts.contentDisposition || undefined);
        this.getContentEncoding = this.standardizeOptions(opts.contentEncoding || undefined);
        this.getContentType = this.standardizeOptions(opts.contentType || defaultContentType);
        this.getKey = this.standardizeOptions(opts.key || defaultKey);
        this.getMetadata = this.standardizeOptions(opts.metadata || undefined);
        this.getServerSideEncryption = this.standardizeOptions(opts.serverSideEncryption || undefined);
        this.getSseKmsKeyId = this.standardizeOptions(opts.sseKmsKeyId || undefined);
        this.getStorageClass = this.standardizeOptions(opts.storageClass || "STANDARD");
    }
    // Convert all option types to a standard async function
    standardizeOptions(option) {
        return (req, file) => {
            return new Promise((resolve, reject) => {
                if (typeof option === "function") {
                    if (option.length >= 3) {
                        // It's a callback-based function: (req, file, cb)
                        option(req, file, (error, value) => {
                            if (error) {
                                reject(error);
                            }
                            else {
                                resolve(value);
                            }
                        });
                    }
                    else {
                        // It's an async function: (req, file) => T | Promise<T>
                        try {
                            const result = option(req, file);
                            Promise.resolve(result).then(resolve).catch(reject);
                        }
                        catch (error) {
                            reject(error);
                        }
                    }
                }
                else {
                    // It's a static value: T or Promise<T>
                    Promise.resolve(option).then(resolve).catch(reject);
                }
            });
        };
    }
    collect(req, file) {
        return __awaiter(this, void 0, void 0, function* () {
            // Start all the option retrievals concurrently
            const [acl, bucket, cacheControl, contentDisposition, contentEncoding, contentType, key, metadata, serverSideEncryption, sseKmsKeyId, storageClass,] = yield Promise.all([
                this.getAcl(req, file),
                this.getBucket(req, file),
                this.getCacheControl(req, file),
                this.getContentDisposition(req, file),
                this.getContentEncoding(req, file),
                this.getContentType(req, file),
                this.getKey(req, file),
                this.getMetadata(req, file),
                this.getServerSideEncryption(req, file),
                this.getSseKmsKeyId(req, file),
                this.getStorageClass(req, file),
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
                serverSideEncryption,
                sseKmsKeyId,
                storageClass,
            };
        });
    }
    _handleFile(req, file, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const opts = yield this.collect(req, file);
                // Build the S3 upload parameters
                const params = {
                    ACL: opts.acl,
                    Bucket: opts.bucket,
                    Key: opts.key,
                    CacheControl: opts.cacheControl,
                    ContentDisposition: opts.contentDisposition,
                    ContentEncoding: opts.contentEncoding,
                    ContentType: opts.contentType,
                    Metadata: opts.metadata,
                    ServerSideEncryption: opts.serverSideEncryption,
                    SSEKMSKeyId: opts.sseKmsKeyId,
                    StorageClass: opts.storageClass,
                    Body: file.stream,
                };
                const upload = new lib_storage_1.Upload({
                    client: this.s3,
                    params,
                });
                let currentSize = 0;
                upload.on("httpUploadProgress", function (ev) {
                    if (ev.total)
                        currentSize = ev.total;
                });
                const result = yield upload.done();
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
                    versionId: result.VersionId,
                });
            }
            catch (error) {
                cb(error);
            }
        });
    }
    _removeFile(req, file, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.s3.send(new client_s3_1.DeleteObjectCommand({
                    Bucket: file.bucket,
                    Key: file.key,
                }));
                cb();
            }
            catch (error) {
                cb(error);
            }
        });
    }
}
function default_1(opts) {
    return new S3Storage(opts);
}
// Maintain compatibility with the original module
function staticValue(value) {
    return function (req, file, cb) {
        cb(null, value);
    };
}
// Regular expression to detect svg file content, inspired by: https://github.com/sindresorhus/is-svg/blob/master/index.js
// It is not always possible to check for an end tag if a file is very big. The firstChunk, see below, might not be the entire file.
var svgRegex = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*>\s*)?<svg[^>]*>/i;
function isSvg(svg) {
    // Remove DTD entities
    svg = svg.replace(/\s*<!Entity\s+\S*\s*(?:"|')[^"]+(?:"|')\s*>/gim, "");
    // Remove DTD markup declarations
    svg = svg.replace(/\[?(?:\s*<![A-Z]+[^>]*>\s*)*\]?/g, "");
    // Remove HTML comments
    svg = svg.replace(html_comment_regex_1.default, "");
    return svgRegex.test(svg);
}
function autoContentType(req, file, cb) {
    file.stream.once("data", function (firstChunk) {
        return __awaiter(this, void 0, void 0, function* () {
            var type = yield (0, file_type_1.fileTypeFromBuffer)(firstChunk);
            var mime = "application/octet-stream"; // default type
            // Make sure to check xml-extension for svg files.
            if (type && type.ext === "xml" && isSvg(firstChunk.toString())) {
                mime = "image/svg+xml";
            }
            else if (type) {
                mime = type.mime;
            }
            var outStream = new stream_1.default.PassThrough();
            outStream.write(firstChunk);
            file.stream.pipe(outStream);
            cb(null, mime, outStream);
        });
    });
}
exports.AUTO_CONTENT_TYPE = autoContentType;
exports.DEFAULT_CONTENT_TYPE = staticValue(defaultContentType);
