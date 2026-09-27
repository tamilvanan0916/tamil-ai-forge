import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const mediaUrl = (relativePath: string) => {
  if (!relativePath) return '';
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  const clean = relativePath.replace(/^[\/\\]+/, '').replace(/\\/g, '/');
  return `${API_BASE_URL}/media/${clean}`;
};
