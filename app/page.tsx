import { Boxes, FileCode2, Link2, Play } from 'lucide-react'
import Link from 'next/link'
import { LogoutButton } from '@/components/api-hub/logout-button'

const features = [
  {
    icon: Link2,
    title: 'Aponte para qualquer spec',
    description:
      'Informe a URL pública do seu documento OpenAPI/Swagger (JSON ou YAML) e a documentação é gerada na hora.',
  },
  {
    icon: FileCode2,
    title: 'Exemplos prontos',
    description:
      'Schemas, parâmetros e exemplos de requisição/resposta organizados por tag, com snippets de código prontos para copiar.',
  },
  {
    icon: Play,
    title: 'Teste sem sair da página',
    description:
      'Envie requisições reais para a API a partir do "Testar endpoint" e veja status, headers e corpo da resposta.',
  },
]

// A middleware protege '/' junto com '/docs' — só uma sessão autenticada
// chega até aqui, então esta página funciona como o hub de entrada
// pós-login, sem precisar checar a sessão de novo.
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center px-4 xl:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <Boxes className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            API Hub
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/docs"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Ir para a documentação
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Documentação de APIs, gerada a partir da sua spec OpenAPI
        </h1>
        <p className="mt-4 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
          Transforme qualquer especificação OpenAPI em uma documentação
          moderna, elegante e interativa, alinhada à identidade visual do seu
          produto.
        </p>
        <Link
          href="/docs"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
        >
          Acessar documentação
        </Link>

        <div className="mt-20 grid w-full max-w-4xl gap-6 text-left sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-5"
            >
              <feature.icon className="size-5 text-brand" />
              <h2 className="mt-3 text-sm font-semibold text-foreground">
                {feature.title}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
