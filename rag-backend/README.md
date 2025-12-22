# RAG Backend - Production-Style Document Q&A System

A complete Retrieval-Augmented Generation (RAG) backend built with Node.js, Express, Supabase, and Groq API. Upload PDF documents and ask questions to get AI-powered answers with source citations.

![Architecture](https://img.shields.io/badge/Architecture-RAG-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 🚀 Features

- **PDF Document Ingestion** - Upload PDFs, extract text, chunk, and store with embeddings
- **Semantic Search** - Find relevant content using vector similarity
- **AI-Powered Answers** - Generate grounded responses using Groq's Llama 3.1
- **Source Citations** - Every answer includes source chunks with similarity scores
- **Local Embeddings** - Uses Transformers.js (no API limits, works offline)
- **Latency Tracking** - Built-in metrics for all operations
- **Error Handling** - Comprehensive error handling with custom AppError class

## 📋 Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Express.js |
| Embeddings | Transformers.js (all-MiniLM-L6-v2, 384 dims) |
| LLM | Groq API (Llama 3.1 8B) |
| Vector DB | Supabase + pgvector |
| PDF Parsing | pdf-parse |

## 🛠️ Installation

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone and Install

```bash
cd rag-backend
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Groq API Configuration (for LLM)
GROQ_API_KEY=your_groq_api_key

# Server Configuration (optional)
PORT=3000
CHUNK_SIZE=500
CHUNK_OVERLAP=50
TOP_K_RESULTS=5
```

### 3. Set Up Supabase Database

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create chunks table with 384-dimensional embeddings
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(384),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for fast vector search
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 4. Start the Server

```bash
npm start
```

Server runs at `http://localhost:3000`

## 📖 API Documentation

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-17T18:00:00.000Z",
  "uptime": 123.456
}
```

### Upload Document

```bash
POST /ingest
Content-Type: multipart/form-data

file: <PDF file>
```

Response:
```json
{
  "success": true,
  "data": {
    "documentId": "uuid",
    "fileName": "document.pdf",
    "pageCount": 10,
    "chunkCount": 25
  },
  "metrics": {
    "totalTimeMs": 5432,
    "timings": {
      "extractionMs": 500,
      "chunkingMs": 10,
      "embeddingMs": 3000,
      "storageMs": 1922
    }
  }
}
```

### Ask Question

```bash
POST /query
Content-Type: application/json

{
  "question": "What skills does Amandeep have?",
  "topK": 5
}
```

Response:
```json
{
  "success": true,
  "data": {
    "answer": "Amandeep has skills in Java, Python, React.js...",
    "sources": [
      {
        "chunkId": "uuid",
        "content": "Skills section...",
        "similarity": 89.5,
        "metadata": { "chunkIndex": 5 }
      }
    ],
    "hasContext": true
  },
  "metrics": {
    "totalTimeMs": 2100,
    "timings": {
      "embeddingMs": 200,
      "searchMs": 800,
      "llmMs": 1100
    },
    "tokenUsage": {
      "promptTokens": 500,
      "completionTokens": 150,
      "totalTokens": 650
    }
  }
}
```

## 📁 Project Structure

```
rag-backend/
├── src/
│   ├── app.js                 # Express server entry point
│   ├── config/
│   │   └── index.js           # Environment configuration
│   ├── db/
│   │   └── supabase.js        # Database client & vector search
│   ├── middleware/
│   │   ├── errorHandler.js    # Global error handling
│   │   └── latencyTracker.js  # Request timing middleware
│   ├── routes/
│   │   ├── ingest.js          # POST /ingest endpoint
│   │   └── query.js           # POST /query endpoint
│   ├── services/
│   │   ├── embeddings.js      # Local embedding generation
│   │   ├── llm.js             # Groq LLM integration
│   │   ├── pdfExtractor.js    # PDF text extraction
│   │   └── chunker.js         # Text chunking logic
│   └── utils/
│       └── logger.js          # Console logging utility
├── .env                       # Environment variables
├── .env.example               # Example environment file
├── package.json
└── README.md
```

## 🔧 Error Handling

The backend includes comprehensive error handling:

| Error Type | Status Code | Description |
|------------|-------------|-------------|
| No file uploaded | 400 | File field missing in request |
| Invalid PDF | 400 | File is not a valid PDF |
| Empty PDF | 422 | Could not extract text (scanned/image PDF) |
| Empty question | 400 | Question field missing or empty |
| LLM failure | 500 | Groq API error |
| Database error | 500 | Supabase connection/query error |

All errors return consistent JSON:
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "timestamp": "2024-12-17T18:00:00.000Z"
  }
}
```

## ⚡ Performance Notes

- **First query**: ~6-10 seconds (embedding model loads, ~23MB download)
- **Subsequent queries**: ~1-3 seconds
- **Document ingestion**: ~500ms per chunk (embedding) + storage time
- **Vector search**: Computed in JavaScript for reliability

## 🔮 TODO / Future Improvements

- [ ] Streaming responses for real-time output
- [ ] Conversation history support
- [ ] Query caching
- [ ] Batch embedding processing
- [ ] Support for more file formats (DOCX, TXT, HTML)
- [ ] Async job queue for large files
- [ ] Redis caching layer
- [ ] Rate limiting
- [ ] Authentication

## 🤝 Frontend

A Next.js frontend is available in the `rag-ai-tool-ui` folder:

```bash
cd ../rag-ai-tool-ui
npm install
npm run dev
```

Frontend runs at `http://localhost:3001`

## 📄 License

MIT License - feel free to use for learning and projects.

---

Built with ❤️ using Node.js, Supabase, Groq, and Transformers.js
