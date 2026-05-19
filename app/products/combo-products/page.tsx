import { redirect } from 'next/navigation';

export default function ComboProductsPage() {
  redirect('/products?domain=combo_product');
}
