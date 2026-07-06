/**
 * Fuso horário do app — usado no formato de datas (páginas e tabelas) e nas
 * agregações por dia no Postgres (AT TIME ZONE), já que o servidor roda em
 * UTC (containers) mas o negócio é em Brasília. Mesma variável TZ que já
 * configura o timezone padrão do processo Node (ver Dockerfile), pra não ter
 * duas variáveis pro mesmo conceito. Só surte efeito em contexto de
 * servidor: .env não é copiado pra dentro da imagem Docker (ver
 * .dockerignore), então componentes client (bundle já compilado) sempre
 * caem no default abaixo.
 */
export const APP_TIMEZONE = process.env.TZ || 'America/Sao_Paulo'
