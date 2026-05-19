import { redirect } from 'next/navigation';

export default function SemiProductsPage() {
  redirect('/products?domain=semi_product');
}
