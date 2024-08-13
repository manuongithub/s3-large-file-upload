const { getSignedUrlWithRetry, uploadChunkWithRetry } = require('./upload');
const maxRetries = 5;

describe('getSignedUrlWithRetry', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should return a signed URL on first try', async () => {
        const mockUrl = 'http://example.com/signed-url';
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue({ signedUrl: mockUrl }),
        });

        const bucket = 'bucket';
        const key = 'key';
        const partNumber = 1;
        const uploadId = 'uploadId';

        const result = await getSignedUrlWithRetry(bucket, key, partNumber, uploadId);
        expect(result).toBe(mockUrl);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually return a signed URL', async () => {
        const mockUrl = 'http://example.com/signed-url';
        global.fetch
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ signedUrl: mockUrl }),
            });

        const bucket = 'bucket';
        const key = 'key';
        const partNumber = 1;
        const uploadId = 'uploadId';

        const result = await getSignedUrlWithRetry(bucket, key, partNumber, uploadId);
        expect(result).toBe(mockUrl);
        expect(global.fetch).toHaveBeenCalledTimes(2); 
    });
});

describe('uploadChunkWithRetry', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should upload a chunk and return ETag on first try', async () => {
        const mockETag = '"etag-123"';
        global.fetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map([['ETag', mockETag]])
        });

        const signedUrl = 'http://example.com/signed-url';
        const chunk = new Blob(['chunk data']);
        const partNumber = 1;
        const bucket = 'bucket';
        const key = 'key';
        const uploadId = 'uploadId';

        const result = await uploadChunkWithRetry(signedUrl, chunk, partNumber, bucket, key, uploadId);
        expect(result).toEqual({ PartNumber: partNumber, ETag: mockETag });
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
