// components/BulkTTSJobMonitor.tsx
// Monitor and view progress of bulk TTS generation jobs

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  CheckCircle, XCircle, Clock, Download, RefreshCw,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import type { BulkTTSJob, BulkTTSGeneration } from '@rekindle/types/bulkTTS';

export const BulkTTSJobMonitor: React.FC = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<BulkTTSJob[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<Record<string, BulkTTSGeneration[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  
  // Load jobs
  useEffect(() => {
    if (user) {
      loadJobs();
      
      // Set up real-time subscription for job updates
      const subscription = supabase
        .channel('bulk_tts_jobs_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bulk_tts_jobs',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Job updated:', payload);
            loadJobs();
          }
        )
        .subscribe();
      
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);
  
  const loadJobs = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('bulk_tts_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setJobs(data || []);
    } catch (err) {
      console.error('Error loading jobs:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadJobDetails = async (jobId: string) => {
    if (jobDetails[jobId]) {
      // Already loaded, just toggle
      setExpandedJob(expandedJob === jobId ? null : jobId);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('bulk_tts_generations')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      setJobDetails(prev => ({ ...prev, [jobId]: data || [] }));
      setExpandedJob(jobId);
    } catch (err) {
      console.error('Error loading job details:', err);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };
  
  const exportResults = (job: BulkTTSJob) => {
    const csv = generateResultsCSV(job);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.job_name}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const generateResultsCSV = (job: BulkTTSJob): string => {
    let csv = 'slide_id,language,status,audio_url,error\n';
    
    Object.entries(job.results || {}).forEach(([slideId, languages]) => {
      Object.entries(languages).forEach(([lang, result]: [string, any]) => {
        csv += `"${slideId}","${lang}","${result.status}","${result.url || ''}","${result.error || ''}"\n`;
      });
    });
    
    return csv;
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bulk TTS Jobs</h2>
        <Button variant="outline" size="sm" onClick={loadJobs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No bulk TTS jobs yet. Create one to get started!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <Card key={job.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {job.job_name}
                      <Badge className={getStatusColor(job.status)}>
                        {getStatusIcon(job.status)}
                        <span className="ml-1 capitalize">{job.status}</span>
                      </Badge>
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Created {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {job.status === 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportResults(job)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadJobDetails(job.id)}
                    >
                      {expandedJob === job.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {/* Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{job.completed_generations} / {job.total_generations} completed</span>
                    <span>{Math.round((job.completed_generations / job.total_generations) * 100)}%</span>
                  </div>
                  <Progress 
                    value={(job.completed_generations / job.total_generations) * 100}
                  />
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Slides</div>
                    <div className="font-semibold">{job.total_slides}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Languages</div>
                    <div className="font-semibold">{job.total_languages}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Failed</div>
                    <div className="font-semibold text-red-600">{job.failed_generations}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Cost</div>
                    <div className="font-semibold">
                      ${(job.actual_cost || job.estimated_cost || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                
                {/* Expanded Details */}
                {expandedJob === job.id && jobDetails[job.id] && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="font-semibold mb-2">Generation Details</h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {jobDetails[job.id].map(gen => (
                        <div 
                          key={gen.id}
                          className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            {getStatusIcon(gen.status)}
                            <span className="font-mono text-xs">{gen.slide_id}</span>
                            <Badge variant="outline" className="text-xs">
                              {gen.language}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {gen.status === 'completed' && gen.audio_url && (
                              <a 
                                href={gen.audio_url} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Audio
                              </a>
                            )}
                            {gen.status === 'failed' && (
                              <span className="text-red-600 text-xs">
                                {gen.error_message}
                              </span>
                            )}
                            {gen.cost && (
                              <span className="text-xs">${gen.cost.toFixed(4)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};