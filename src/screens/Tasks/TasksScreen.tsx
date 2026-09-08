import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllTasks } from '../../services/taskService'
import type { Project, Task } from '../../types'

export default function TasksScreen() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [projs, allTasks] = await Promise.all([getAllProjects(), getAllTasks()])
      setProjects(projs)
      setTasks(allTasks)
      setIsLoading(false)
    }
    load()
  }, [])

  const filtered = projects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800 mb-3">Tasks</h1>
        <SearchBar value={search} onChange={setSearch} placeholder="Search projects…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(project => {
          const projectTasks = tasks.filter(t => t.projectId === project.id)
          const openCount = projectTasks.filter(t => t.status !== 'completed').length
          return (
            <button key={project.id} onClick={() => navigate(`/projects/${project.id}?tab=tasks`)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-slate-800">{project.name}</span>
                <StatusBadge status={project.status} />
              </div>
              <p className="text-xs text-slate-500">
                {projectTasks.length === 0 ? 'No tasks yet' : `${openCount} open of ${projectTasks.length} task${projectTasks.length !== 1 ? 's' : ''}`}
              </p>
            </button>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No projects found.</p>
        )}
      </div>
    </div>
  )
}
