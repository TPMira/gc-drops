# GrandChase Drops - Discord Bot

Bot de Discord para ver e cadastrar no Rank de Ataque e ver filas de Duo.

## Comandos

| Comando | Descrição |
|---------|-----------|
| `/rank` | Mostra o ranking (Build 120 ou 100) com paginação e botões |
| `/duo`  | Mostra as filas de duo abertas |

## Setup

### 1. Criar o Bot no Discord

1. Vá em https://discord.com/developers/applications
2. Clique em **New Application** → dê um nome
3. Na aba **Bot**:
   - Clique em **Reset Token** e copie o token
   - Ative **MESSAGE CONTENT INTENT** se quiser usar mensagens no futuro
4. Na aba **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
   - Copie a URL e adicione o bot no seu server

### 2. Configurar o `.env`

```bash
cd discord-bot
cp .env.example .env
```

Edite o `.env`:
```
DISCORD_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui
DISCORD_GUILD_ID=id_do_server_de_teste   # opcional, deixe vazio pra global
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Registrar os comandos

```bash
npm run register
```

> Se você colocou `DISCORD_GUILD_ID`, os comandos aparecem instantaneamente.  
> Se deixou vazio (global), pode demorar até 1 hora.

### 5. Rodar o bot

```bash
npm start
```

Ou em modo dev (auto-reload):
```bash
npm run dev
```

## Funcionalidades

- **`/rank`**: Mostra o ranking com paginação (10 por página)
  - Botões: ◀ Anterior | Próxima ▶ | Ver Build 100/120 | ➕ Cadastrar
  - Cadastrar abre um modal pra preencher os dados

- **`/duo`**: Lista as filas de duo abertas (até 10)

## Dados

O bot lê/escreve nos mesmos arquivos JSON da pasta `data/` do projeto Next.js:
- `attackRanks.json` (Build 120)
- `attackRanks100.json` (Build 100)
- `duoQueues.json`

Se você rodar o bot localmente e o Next.js também, os dados são compartilhados.
