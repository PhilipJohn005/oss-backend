import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { fetch } from 'undici';
import getEmbedding from './embed'
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const app = express();

const allowedOrigins = ['https://oss-main-website.vercel.app' , 'http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, 
}));



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


async function fetchAllIssues(owner: string, repo: string): Promise<any[]> {
  let allIssues: any[] = [];
  let page = 1;

  while (true) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100&page=${page}`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'OSS-Hub-App',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`GitHub API error on page ${page}: ${err || JSON.stringify(err)}`);
    }

    const pageIssues = await res.json() as any[];

    if (pageIssues.length === 0) break; // done
    allIssues.push(...pageIssues);
    page++;
  }

  return allIssues;
}



app.post('/server/add-card', async (req, res) => {
  console.log("🔥 /server/add-card endpoint hit");

  const { repo_url, product_description, tags } = req.body;

  const token = req.headers.authorization?.split(' ')[1];

  if (!repo_url || !product_description || !tags || !token) {
    res.status(400).json({ error: 'repo_url, product_description, tags, and auth token are required' });
    return;
  }

  try{
    const decoded = jwt.verify(token, process.env.BACKEND_JWT_SECRET as string) as any;  //wrong will be caught in exception
    const user_email = decoded.email;
    const user_name = decoded.name;
    const access_token=decoded.accessToken;

    const { owner, repo } = extractOwnerAndRepo(repo_url);

    // 🔥 1. Get repo metadata
    console.time("🐙 Fetch repo details");

      const repoDetailsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'User-Agent': 'OSS-Hub-App',
          Accept: 'application/vnd.github.v3+json',
        }
      });
      const repoDetails = await repoDetailsRes.json();
    console.timeEnd("🐙 Fetch repo details");

      if (!repoDetailsRes.ok) {
        const details = repoDetails as { message?: string };
        throw new Error(`GitHub repo details error: ${details.message || 'unknown error'}`);
      }

      const { stargazers_count, forks_count,description } = repoDetails as { stargazers_count?: number; forks_count?: number;description?:string };
      const stars = stargazers_count || 0;
      const forks = forks_count || 0;

      // 🔥 2. Get language stats
      console.time("🐙 Fetch language stats");
      const langRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'User-Agent': 'OSS-Hub-App',
          Accept: 'application/vnd.github.v3+json',
        }
      });
      const langJson = await langRes.json();
      console.timeEnd("🐙 Fetch language stats");

      if (!langRes.ok) {
        const langErr = langJson as { message?: string };
        throw new Error(`GitHub languages API error: ${langErr.message || 'unknown error'}`);
      }

      const topLanguage = Object.entries(langJson as Record<string, number>)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
      

    // Fetch issues from GitHub
   
      console.time("🐙 Fetch issues");

    const issuesJson = await fetchAllIssues(owner, repo);
console.timeEnd("🐙 Fetch issues");

    if (!Array.isArray(issuesJson)) {
      throw new Error('GitHub API did not return an array of issues');
    }

    const issuesOnly = issuesJson.filter((issue: any) => !issue.pull_request);
    const openIssuesCount = issuesOnly.length;
    
    const combinedRepoText = `${repo} ${description ?? ''} ${product_description}`;
    console.time("🧠 Embedding repo description");
    const combinedRepoTextEmbedding = await getEmbedding(combinedRepoText);
    console.timeEnd("🧠 Embedding repo description");



        console.time("📦 Insert card into Supabase");

    const { data: cardInsertData, error: cardError } = await supabase
    .from('cards')
    .insert([{
      card_name: repo,
      repo_url,
      tags,
      user_email,
      user_name,
      product_description,
      stars,
      forks,
      top_language: topLanguage,
      open_issues_count: openIssuesCount,
      embedding: Array.isArray(combinedRepoTextEmbedding) ? combinedRepoTextEmbedding : null
    }])
    .select('id');
console.timeEnd("📦 Insert card into Supabase");


    if (cardError || !cardInsertData || cardInsertData.length === 0) {
      throw new Error(cardError?.message || 'Failed to insert card');
    }

    const card_id = cardInsertData[0].id;

   
    const issuesWithEmbeddings = await Promise.all(  //sabka await karo so that we get the proper updated data
      issuesOnly.map(async (iss: any,index:number) => {
         const combinedText = `${iss.title} ${iss.body ?? ''}`;

        const embedding = await getEmbedding(combinedText);

        return {
          card_id,
          title: iss.title,
          description: iss.body ?? '',
          embedding: Array.isArray(embedding) ? embedding : null,
          link: iss.html_url,
          tags: iss.labels.map((label: any) => label.name),
          image: extractImagesFromMarkdown(iss.body ?? '')[0] ?? null
        };
      })
    );

    const validIssues=issuesWithEmbeddings.filter((issue)=>issue.embedding!==null)
console.time("📦 Insert issues into Supabase");

    if (validIssues.length > 0) {
      const { error: issueError } = await supabase
        .from('issues')
        .insert(validIssues);
      if (issueError) throw issueError;
    }
console.timeEnd("📦 Insert issues into Supabase");


    console.time("🌐 Webhook setup");

    try {
      const webhookRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'oss-hub-app'
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['issues'],
          config: {
            url: `${process.env.WEBHOOK_LISTENER_URL}`,
            content_type: 'json'
          }
        })
      });

      const webhookJson: any = await webhookRes.json();
      console.timeEnd("🌐 Webhook setup");

      if (!webhookRes.ok) {
        if (webhookRes.status === 401 || webhookJson?.message?.includes('Bad credentials')) {
          res.status(403).json({ error: 'GitHub access expired. Please log in again.' });
          
        }
        if (
          webhookRes.status === 422 &&
          webhookJson?.errors?.some((err: any) => err.message === 'Hook already exists on this repository')
        ) {
          console.warn("ℹ️ Webhook already exists, continuing...");
          // Do NOT treat this as failure — just proceed
          res.status(200).json({ message: 'Card and issues added (webhook already exists)', issuesCount: validIssues.length });
          return;
        }
        
        res.status(500).json({ error: 'Webhook creation failed. Check repo permissions or try again later.' });
        
        return;
      } 
      res.status(200).json({ message: 'Card and issues added', issuesCount: validIssues.length });
      return;

    } catch (err) {
      console.error("Webhook creation failed:", err);
      res.status(500).json({ error: 'Unexpected error during webhook setup' }); // ✅ THIS LINE IS NEEDED
      return;
    }
  }
   catch (error: any) {
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
    const decoded = jwt.verify(token as string, process.env.BACKEND_JWT_SECRET as string);
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



app.get('/server/fetch-card-des/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }

  try {
    // Fetch the card
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('*')
      .eq('id', id)
      .single();

    if (cardError || !card) {
      res.status(404).json({ error: 'Card not found', detail: cardError });
      return;
    }

    // Fetch related issues
    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select('*')
      .eq('card_id', id)
      .order('id', { ascending: false }); // newest issues first (optional)

    if (issuesError) {
      res.status(500).json({ error: 'Failed to fetch issues', detail: issuesError });
      return;
    }

    // Combine and send
    res.status(200).json({
      data: {
        ...card,
        issues: issues || [],
      },
    });

  } catch (err) {
    console.error('Error fetching card with issues:', err);
    res.status(500).json({ error: 'Server error' });
    return;
  }
});


app.post('/server/generate-embedding', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Invalid input: text is required' });
    return;
  }

  try {
    console.time('🧠 [Total embedding time]');
    const embedding = await getEmbedding(text);
    console.timeEnd('🧠 [Total embedding time]');

    if (!embedding || !Array.isArray(embedding)) {
      res.status(500).json({ error: 'Embedding failed' });
      return;
    }

    res.status(200).json({ embedding });
  } catch (err: any) {
    console.error('❌ Error in /server/generate-embedding:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

app.get('/ping', (req, res) => {
  try {
    console.log(`Ping hit at: ${new Date().toISOString()}`);
    res.status(200).send("Pinged");
  } catch (error) {
    console.error("Ping error:", error);
    res.status(500).send("Something went wrong");
  }
});


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
