import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/login');
  // The redirect function will stop rendering, so no need to return null explicitly.
}
