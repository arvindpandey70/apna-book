import axios from 'axios';

const baseUrl = import.meta.env.VITE_API_URL || 'https://apna-book.onrender.com';

const axiosInstance = axios.create({
  baseURL: `${baseUrl}/api`, // your API base URL
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axiosInstance;
