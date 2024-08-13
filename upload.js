// Define the max upload size, chunks, and retries globally
const maxUploadSize = 4 * 1024 * 1024 * 1024; // 4GB in bytes
const maxChunks = 15;
const maxRetries = 5;

// Function to get signed URL for each part with retry logic
async function getSignedUrlWithRetry(bucket, key, partNumber, uploadId, retries = 0) {
  try {
      const response = await fetch('http://localhost:3000/get-signed-url', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bucket, key, partNumber, uploadId }),
      });
      if (!response.ok) {
          throw new Error(`Failed to get signed URL for part ${partNumber}`);
      }
      const data = await response.json();
      return data.signedUrl;
  } catch (error) {
      if (retries < maxRetries) {
          console.warn(`Retrying getSignedUrl for part ${partNumber} (Attempt ${retries + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 1000)); // Exponential backoff
          return getSignedUrlWithRetry(bucket, key, partNumber, uploadId, retries + 1);
      } else {
          throw new Error(`Failed to get signed URL for part ${partNumber} after ${maxRetries} attempts`);
      }
  }
}


// Function to upload a chunk with retry logic
async function uploadChunkWithRetry(signedUrl, chunk, partNumber, bucket, key, uploadId, retries = 0) {
  try {
      const response = await fetch(signedUrl, {
          method: 'PUT',
          headers: {
              'Content-Type': 'video/mp4'
          },
          body: chunk
      });
      if (!response.ok) {
          throw new Error(`Failed to upload part ${partNumber}`);
      }
      const etag = response.headers.get('ETag');
      return { PartNumber: partNumber, ETag: etag };
  } catch (error) {
      if (retries < maxRetries) {
          console.warn(`Retrying upload for part ${partNumber} (Attempt ${retries + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000)); // Exponential backoff
          const newSignedUrl = await getSignedUrlWithRetry(bucket, key, partNumber, uploadId); // Get a new signed URL if needed
          return uploadChunkWithRetry(newSignedUrl, chunk, partNumber, bucket, key, uploadId, retries + 1);
      } else {
          throw new Error(`Failed to upload part ${partNumber} after ${maxRetries} attempts`);
      }
  }
}


// Event listener for the upload button
document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('uploadButton');
    const fileInput = document.getElementById('fileInput');
    const progressBar = document.getElementById('uploadProgress');
    const progressText = document.getElementById('progressText');
    const errorMessages = document.getElementById('errorMessages');

    if (!uploadButton || !fileInput || !progressBar || !progressText || !errorMessages) {
        console.error('Required DOM elements are missing.');
        return;
    }

    uploadButton.addEventListener('click', async () => {
        errorMessages.textContent = ''; 

        if (!fileInput.files.length) {
            errorMessages.textContent = 'Please select a file to upload';
            return;
        }

        const file = fileInput.files[0];

        // Check if the file size exceeds the maximum allowed upload size
        if (file.size > maxUploadSize) {
            errorMessages.textContent = 'The selected file exceeds the maximum allowed upload size of 4GB.';
            return;
        }

        // Calculate chunk size dynamically so that the total number of chunks does not exceed maxChunks
        const chunkSize = Math.ceil(file.size / maxChunks);
        const numberOfChunks = Math.ceil(file.size / chunkSize);

        const bucket = 'sf-large-file-upload-bucket';
        const key = `uploads/${file.name}`;
        let uploadId = null;
        let etags = [];
        let uploadedChunks = 0;

        // Initiate multipart upload
        try {
            const initResponse = await fetch('http://localhost:3000/initiate-upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ bucket, key })
            });
            const initData = await initResponse.json();
            uploadId = initData.uploadId;
        } catch (error) {
            errorMessages.textContent = 'Failed to initiate upload: ' + error.message;
            return;
        }

        try {
            // Create an array of promises to get signed URLs in parallel with retry logic
            const signedUrlPromises = [];
            for (let i = 0; i < numberOfChunks; i++) {
                signedUrlPromises.push(getSignedUrlWithRetry(bucket, key, i + 1, uploadId));
            }

            // Wait for all signed URLs to be retrieved
            const signedUrls = await Promise.all(signedUrlPromises);

            // Create an array of promises to upload chunks in parallel with retry logic
            const uploadPromises = [];
            for (let i = 0; i < numberOfChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);
                uploadPromises.push(uploadChunkWithRetry(signedUrls[i], chunk, i + 1));
            }

            // Wait for all uploads to complete
            etags = await Promise.all(uploadPromises);

            // Complete multipart upload
            await fetch('http://localhost:3000/complete-upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ bucket, key, uploadId, etags })
            });

            alert('File uploaded successfully');
            listFiles();
        } catch (error) {
            errorMessages.textContent = 'Upload failed: ' + error.message;
        }
    });

    async function listFiles() {
        const bucket = "sf-large-file-upload-bucket";
        const response = await fetch(`http://localhost:3000/list-mp4-files?bucket=${bucket}`);
        const files = await response.json();

        const fileList = document.getElementById('fileList');
        if (fileList) {
            fileList.innerHTML = '';
            files.forEach(file => {
                const listItem = document.createElement('li');
                listItem.textContent = file.key;
                listItem.style.cursor = 'pointer'; // Add pointer cursor
                listItem.addEventListener('click', () => playVideo(file.url));
                fileList.appendChild(listItem);
            });
        }
    }

    function playVideo(url) {
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer) {
            videoPlayer.src = url;
            videoPlayer.play();
        }
    }

    // List files on page load
    listFiles();
});

// Export functions for testing purposes
module.exports = {
    getSignedUrlWithRetry,
    uploadChunkWithRetry
};
