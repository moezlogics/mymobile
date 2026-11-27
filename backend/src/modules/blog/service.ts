import { MedusaService } from "@medusajs/framework/utils"
import { BlogPost } from "./models/post"
import { BlogCategory } from "./models/category"
import { BlogAuthor } from "./models/author"
import { BlogTag } from "./models/tag"
import { BlogComment } from "./models/comment"
import { CmsPage } from "./models/page"

class BlogModuleService extends MedusaService({
  BlogPost,
  BlogCategory,
  BlogAuthor,
  BlogTag,
  BlogComment,
  CmsPage,
}) {}

export default BlogModuleService
