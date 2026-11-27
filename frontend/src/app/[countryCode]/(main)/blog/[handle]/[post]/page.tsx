import { Metadata } from "next"
import BlogPostPage, { generateMetadata as postMetadata } from "../page"

/**
 * /blog/{category}/{post}/ — the canonical mymobile.pk post URL.
 * Renders the shared post page; a category that isn't the post's primary
 * one 301s to the canonical path inside BlogPostPage.
 */
type Props = {
  params: Promise<{ countryCode: string; handle: string; post: string }>
}

const remap = async (props: Props) => {
  const p = await props.params
  return { params: Promise.resolve({ countryCode: p.countryCode, handle: p.post, category: p.handle }) }
}

export const revalidate = 300

export async function generateMetadata(props: Props): Promise<Metadata> {
  return postMetadata(await remap(props))
}

export default async function BlogCategoryPostPage(props: Props) {
  return BlogPostPage(await remap(props))
}
