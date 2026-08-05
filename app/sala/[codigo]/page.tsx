import { redirect } from 'next/navigation';

export default function SalaRedirect({ params }: { params: { codigo: string } }) {
  redirect(`/juegos/stop/sala/${params.codigo}`);
}
