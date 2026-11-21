# The Man Store — Documentation Hub

Welcome to the comprehensive technical documentation for **The Man Store** e-commerce platform.

---

## 📚 Table of Contents

### 🏛️ Architecture & System Design
| Document | Description | Path |
| :--- | :--- | :--- |
| **System Architecture** | Full client-server architecture, protocols, microservices & integrations | [SystemArchitecture.md](architecture/SystemArchitecture.md) |
| **Architecture Diagram** | Visual fullstack architecture diagram | [system-architecture-diagram.jpg](system-architecture-diagram.jpg) |

---

### 🗄️ Database & Schema Design
| Document | Description | Path |
| :--- | :--- | :--- |
| **Entity Relationship Diagram (ERD)** | Normalized relational schema with foreign key relationships & Chen notation | [ERD.md](database/ERD.md) |
| **Data Dictionary** | Detailed schema specifications, table descriptions, columns, data types & constraints | [DataDictionary.md](database/DataDictionary.md) |
| **Full Chen ERD (Edraw Ready)** | Chen-style visual ERD mapping for Edraw / drawing tools | [ERD_all.md](database/ERD_all.md) |
| **ERD Reference** | Visual entity diagrams and attributes | [Entity_Relationship_Diagram.md](database/Entity_Relationship_Diagram.md) |

---

### 🔄 Data Flow Diagrams (DFD)
| Document | Description | Path |
| :--- | :--- | :--- |
| **Data Flow Diagram (DFD)** | Context level & Level 1 process breakdown for core e-commerce workflows | [DFD.md](dfd/DFD.md) |
| **Gane & Sarson DFD** | Standard Gane & Sarson notation data flow model | [DFD_Gane&Sarson.md](dfd/DFD_Gane&Sarson.md) |
| **Gane & Sarson (CR Edition)** | Cross-referenced DFD with detailed process definitions | [DFD_Gane&Sarson_CR.md](dfd/DFD_Gane&Sarson_CR.md) |

---

### 🤖 AI, Machine Learning & Image Search
| Document | Description | Path |
| :--- | :--- | :--- |
| **Image Search Guide** | CLIP & Qdrant vector-based visual product similarity search | [IMAGE_SEARCH_GUIDE.md](ai/IMAGE_SEARCH_GUIDE.md) |
| **Image Search Refactor** | Architecture and performance refactoring notes for visual search | [IMAGE_SEARCH_REFACTOR.md](ai/IMAGE_SEARCH_REFACTOR.md) |
| **Hugging Face Vector Space** | Qdrant vector search microservice setup on Hugging Face Spaces | [huggingface-vector-space.md](ai/huggingface-vector-space.md) |
| **Hugging Face Chatbot Space** | AI assistant service deployment on Hugging Face | [huggingface-chat-space.md](ai/huggingface-chat-space.md) |
| **Custom AI Chat Plan** | Architecture plan for proprietary store chatbot | [own-chat-ai-plan.md](ai/own-chat-ai-plan.md) |
| **Custom AI Chat Setup** | Setup & execution steps for local/hosted AI chat service | [own-chat-ai-setup.md](ai/own-chat-ai-setup.md) |
| **VPS Backend Ollama** | Self-hosted Ollama LLM setup on VPS | [vps-backend-ollama.md](ai/vps-backend-ollama.md) |
| **AI Fine-tuning Samples** | Training data and intent samples for e-commerce shopping assistant | [ai-finetune/](ai-finetune/) |

---

### 🚀 DevOps, Infrastructure & Deployment
| Document | Description | Path |
| :--- | :--- | :--- |
| **pgAdmin Connection** | Connecting pgAdmin to PostgreSQL (Local, Docker, Cloud) | [pgadmin-connection.md](devops/pgadmin-connection.md) |
| **Railway PostgreSQL Guide** | Setting up managed PostgreSQL on Railway | [railway-postgres-try.md](devops/railway-postgres-try.md) |
| **Backend API Docs** | Laravel REST API documentation, OpenAPI specs & Postman | [../backend/docs/](../backend/docs/) |

---

<sub>© The Man Store. All rights reserved.</sub>
