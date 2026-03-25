export interface DeploymentModTemplateSummary {
  template_id: string
  name: string
  version: string
  description: string
  author: string
  tags: string[]
  source: string
  builtin_profile: string
}

export interface DeploymentModTemplateDetail {
  metadata: Record<string, any>
  components: Array<Record<string, any>>
  deployments: Array<Record<string, any>>
  launches: Array<Record<string, any>>
  configs: Array<Record<string, any>>
  form_schema: { fields: Array<Record<string, any>> }
  builtin_profile: string
}

export async function fetchDeploymentModTemplates(): Promise<DeploymentModTemplateSummary[]> {
  const res = await fetch('/api/deployment-mod/templates', { credentials: 'include' })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.detail || '获取模板列表失败')
  return data.templates ?? []
}

export async function fetchDeploymentModTemplateDetail(templateId: string): Promise<DeploymentModTemplateDetail> {
  const res = await fetch(`/api/deployment-mod/templates/${encodeURIComponent(templateId)}`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.detail || '获取模板详情失败')
  return data.template
}

export async function fetchDeploymentModTemplateForm(templateId: string): Promise<any> {
  const res = await fetch(`/api/deployment-mod/templates/${encodeURIComponent(templateId)}/form`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.detail || '获取模板表单失败')
  return data
}
