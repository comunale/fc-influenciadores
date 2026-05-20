import { ValidarClient } from './ValidarClient'

interface SearchParams {
  codigo?: string
  [key: string]: string | undefined
}

export default async function ValidarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const initialCode = params.codigo?.toUpperCase() ?? ''
  return <ValidarClient initialCode={initialCode} />
}
