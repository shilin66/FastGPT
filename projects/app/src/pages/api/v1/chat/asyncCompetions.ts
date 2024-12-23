import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Request accepted, Processing...' }));

  try {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', req.headers.authorization || '');

    const response = await fetch('http://127.0.0.1:3000/api/v1/chat/completions', {
      method: req.method,
      headers,
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('请求失败:', error);
  }
}

export default NextAPI(handler);
