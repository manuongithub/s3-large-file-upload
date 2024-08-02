document.getElementById('uploadButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) {
      alert('Please select a file to upload');
      return;
    }
  
    const file = fileInput.files[0];
    const chunkSize = 10 * 1024 * 1024; // 10MB
    const numberOfChunks = Math.ceil(file.size / chunkSize);
    const bucket = 'sf-large-file-upload-bucket';
    const key = `uploads/${file.name}`;
    let uploadId = null;
    let etags = [];
  
    // Initiate multipart upload
    const initResponse = await fetch('http://localhost:3000/initiate-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bucket, key })
    });
    const initData = await initResponse.json();
    uploadId = initData.uploadId;
  
    // Function to get signed URL for each part
    async function getSignedUrl(partNumber) {
      const response = await fetch('http://localhost:3000/get-signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bucket, key, partNumber, uploadId })
      });
      const data = await response.json();
      return data.signedUrl;
    }
  
    // Function to upload a chunk
    async function uploadChunk(signedUrl, chunk, partNumber) {
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
    }
  
    // Create an array of promises to get signed URLs in parallel
    const signedUrlPromises = [];
    for (let i = 0; i < numberOfChunks; i++) {
      signedUrlPromises.push(getSignedUrl(i + 1));
    }
  
    // Wait for all signed URLs to be retrieved
    const signedUrls = await Promise.all(signedUrlPromises);
  
    // Create an array of promises to upload chunks in parallel
    const uploadPromises = [];
    for (let i = 0; i < numberOfChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      uploadPromises.push(uploadChunk(signedUrls[i], chunk, i + 1));
    }
  
    // Wait for all uploads to complete
    etags = await Promise.all(uploadPromises);
  
    // Update progress
    document.getElementById('progress').innerText = `Uploaded ${numberOfChunks} parts`;
  
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
  });
  
  async function listFiles() {
    const bucket = "sf-large-file-upload-bucket";
    const response = await fetch(`http://localhost:3000/list-mp4-files?bucket=${bucket}`);
    const files = await response.json();
  
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    files.forEach(file => {
      const listItem = document.createElement('li');
      listItem.textContent = file.key;
      listItem.style.cursor = 'pointer'; // Add pointer cursor
      listItem.addEventListener('click', () => playVideo(file.url));
      fileList.appendChild(listItem);
    });
  }
  
  function playVideo(url) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = url;
    videoPlayer.play();
  }
  
  // List files on page load
  listFiles();
  