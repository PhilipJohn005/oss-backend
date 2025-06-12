import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { fetch } from 'undici';

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SESSION_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SESSION_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const GITHUB_TOKEN = process.env.GITHUB_PAT;
if (!GITHUB_TOKEN) {
  throw new Error('Missing GITHUB_TOKEN');
}

function extractOwnerAndRepo(url: string) {
  const m = url.match(/github\.com\/([\w-]+)\/([\w.-]+)/i);
  if (!m) throw new Error('Invalid GitHub URL');
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

function extractImagesFromMarkdown(md: string): string[] {
  const regex = /!\[.*?\]\((https?:\/\/[^)]+\.(?:png|jpe?g|gif|svg))\)/g;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(md))) urls.push(match[1]);
  return urls;
}

app.post('/server/add-card', async (req, res) => {
  const { repo_url, product_description, tags } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  if (!repo_url || !product_description || !tags || !token) {
    res.status(400).json({ error: 'repo_url, product_description, tags, and auth token are required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET as string) as any;
    const user_email = decoded.email;
    const user_name = decoded.name;

    const { owner, repo } = extractOwnerAndRepo(repo_url);

    // Fetch issues (including PRs)
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`;
    const ghRes = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'OSS-Hub-App',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!ghRes.ok) {
      const err = await ghRes.json();
      throw new Error(`GitHub API error: ${err || JSON.stringify(err)}`);
    }

    const issuesJson = await ghRes.json();

    if (!Array.isArray(issuesJson)) {
      throw new Error('GitHub API did not return an array of issues');
    }

    // ❗ Filter out pull requests
    const issuesOnly = issuesJson.filter((issue: any) => !issue.pull_request);

    const issues = issuesOnly.map((iss: any) => ({
      id: iss.id,
      title: iss.title,
      description: iss.body ?? '',
      link: iss.html_url,
      issue_tags:iss.labels.map((label: any) => label.name),
      images: extractImagesFromMarkdown(iss.body ?? '')
    }));

    const { error: supaErr } = await supabase
      .from('cards')
      .insert([{
        card_name: repo,
        repo_url,
        tags,
        user_email,
        user_name,
        product_description,
        issues
      }]);

    if (supaErr) throw supaErr;

    res.status(200).json({ message: 'Card added with GitHub issues', issuesCount: issues.length });
  } catch (error: any) {
    console.error('ADD-CARD ERROR:', error);
    res.status(500).json({ error: error.message || 'Unknown error' });
  }
});

app.get('/server/fetch-card', async (req, res) => {
  const { error, data } = await supabase.from('cards').select('*');
  if (error) {
    console.log('Error in reflecting data: ' + error.message);
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ data });
});

app.get('/server/fetch-user-cards', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token as string, process.env.NEXTAUTH_SECRET as string);
    let user_email: string | undefined;

    if (typeof decoded === 'object' && decoded !== null && 'email' in decoded) {
      user_email = (decoded as jwt.JwtPayload).email as string;
    } else {
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }

    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('user_email', user_email);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/server/fetch-card-des/:id',async(req,res)=>{
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Card not found', detail: error });
      return;
    }

     res.status(200).json({ data });
  } catch (err) {
    console.error('Error fetching card by ID:', err);
    res.status(500).json({ error: 'Server error' });
    return;
  }
})

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
