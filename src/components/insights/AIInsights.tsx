
import React, { useState, useEffect } from 'react';
import { Brain, Info, Zap, AlertTriangle, BarChart3, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface InsightData {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  category: 'pattern' | 'anomaly' | 'trend';
  confidence: number;
  sourceEvents: string[];
  metadata: {
    duration?: number;
    frequency?: number;
    objectTypes?: string[];
    [key: string]: any;
  };
}

interface StatData {
  name: string;
  value: number;
  change: number;
  icon: React.ReactNode;
}

interface TimeSeriesData {
  name: string;
  persons: number;
  vehicles: number;
  other: number;
}

const AIInsights: React.FC = () => {
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [stats, setStats] = useState<StatData[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Generate mock insight data
  useEffect(() => {
    const generateMockInsights = () => {
      const insightTitles = [
        'Recurring activity pattern detected',
        'Unusual object frequency observed',
        'Peak activity time identified',
        'Potential security anomaly',
        'New traffic pattern emerging',
        'Object persistence trend detected'
      ];
      
      const categories: ('pattern' | 'anomaly' | 'trend')[] = ['pattern', 'anomaly', 'trend'];
      const objectTypes = ['person', 'car', 'truck', 'bicycle', 'motorcycle', 'bus'];
      
      const mockInsights: InsightData[] = [];
      
      // Generate 6 random insights
      for (let i = 0; i < 6; i++) {
        const category = categories[Math.floor(Math.random() * categories.length)];
        const timestamp = new Date();
        timestamp.setHours(timestamp.getHours() - Math.random() * 72); // Last 3 days
        
        // Generate a description based on the category
        let description = '';
        const metadata: InsightData['metadata'] = {};
        
        switch (category) {
          case 'pattern':
            const timeOfDay = ['morning', 'afternoon', 'evening'][Math.floor(Math.random() * 3)];
            description = `Consistent ${objectTypes[Math.floor(Math.random() * objectTypes.length)]} activity detected during ${timeOfDay} hours. This pattern has repeated for the last ${Math.floor(Math.random() * 5) + 3} days.`;
            metadata.duration = Math.floor(Math.random() * 120) + 30;
            metadata.frequency = Math.floor(Math.random() * 10) + 1;
            metadata.timeOfDay = timeOfDay;
            break;
          case 'anomaly':
            description = `Unusual increase in ${objectTypes[Math.floor(Math.random() * objectTypes.length)]} detections outside of normal operational hours. This may indicate unauthorized activity.`;
            metadata.severity = ['low', 'medium', 'high'][Math.floor(Math.random() * 3)];
            metadata.deviation = Math.floor(Math.random() * 50) + 20;
            break;
          case 'trend':
            const trend = Math.random() > 0.5 ? 'increasing' : 'decreasing';
            const objectType = objectTypes[Math.floor(Math.random() * objectTypes.length)];
            description = `${trend === 'increasing' ? 'Growing' : 'Declining'} trend in ${objectType} detections over the past ${Math.floor(Math.random() * 7) + 1} days. Rate of change: ${Math.floor(Math.random() * 15) + 5}% per day.`;
            metadata.direction = trend;
            metadata.rate = Math.floor(Math.random() * 15) + 5;
            metadata.objectTypes = [objectType];
            break;
        }
        
        mockInsights.push({
          id: `insight-${Date.now()}-${i}`,
          title: insightTitles[i],
          description,
          timestamp,
          category,
          confidence: 0.7 + (Math.random() * 0.25), // 0.7 to 0.95
          sourceEvents: [`event-${Math.floor(Math.random() * 1000)}`, `event-${Math.floor(Math.random() * 1000)}`],
          metadata
        });
      }
      
      // Sort by timestamp, newest first
      mockInsights.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setInsights(mockInsights);
    };
    
    const generateMockStats = () => {
      setStats([
        {
          name: 'Total Detections',
          value: 1287,
          change: 12.4,
          icon: <Zap className="text-blue-500" />
        },
        {
          name: 'Alerts Generated',
          value: 42,
          change: -8.2,
          icon: <AlertTriangle className="text-avianet-red" />
        },
        {
          name: 'Avg. Confidence',
          value: 87.3,
          change: 4.1,
          icon: <BarChart3 className="text-green-500" />
        },
        {
          name: 'Analysis Runtime',
          value: 96.5,
          change: 2.2,
          icon: <Clock className="text-purple-500" />
        }
      ]);
    };
    
    const generateTimeSeriesData = () => {
      const data: TimeSeriesData[] = [];
      const hours = ['12AM', '3AM', '6AM', '9AM', '12PM', '3PM', '6PM', '9PM'];
      
      hours.forEach(hour => {
        data.push({
          name: hour,
          persons: Math.floor(Math.random() * 50) + (hour.includes('AM') ? 5 : 20),
          vehicles: Math.floor(Math.random() * 40) + (hour.includes('AM') ? 2 : 15),
          other: Math.floor(Math.random() * 10) + 2
        });
      });
      
      setTimeSeriesData(data);
    };
    
    generateMockInsights();
    generateMockStats();
    generateTimeSeriesData();
  }, []);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'pattern':
        return <TrendingUp className="text-blue-500" size={18} />;
      case 'anomaly':
        return <AlertTriangle className="text-avianet-red" size={18} />;
      case 'trend':
        return <BarChart3 className="text-green-500" size={18} />;
      default:
        return <Info size={18} />;
    }
  };

  const handleGenerateInsights = () => {
    setIsAnalyzing(true);
    setProgress(0);
    
    // Simulate analysis progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsAnalyzing(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center">
            <Brain className="mr-2 text-avianet-red" size={20} />
            AI-Powered Event Summarization
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="insights">AI Insights</TabsTrigger>
              <TabsTrigger value="trends">Detection Trends</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
                {stats.map((stat, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
                          {stat.icon}
                        </div>
                        <span className="text-sm font-medium">{stat.name}</span>
                      </div>
                      <div className="mt-3">
                        <div className="text-2xl font-bold">
                          {stat.name === 'Avg. Confidence' || stat.name === 'Analysis Runtime' 
                            ? `${stat.value}%` 
                            : stat.value}
                        </div>
                        <div className={`text-xs flex items-center ${stat.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {stat.change >= 0 ? '↑' : '↓'} {Math.abs(stat.change)}% 
                          <span className="text-gray-500 dark:text-gray-400 ml-1">from last period</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              <div className="border rounded-md p-4">
                <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-medium">Detection Distribution (24h)</h3>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timeSeriesData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="persons"
                        stackId="1"
                        stroke="#ea384c"
                        fill="#ea384c"
                        fillOpacity={0.8}
                        name="Persons"
                      />
                      <Area
                        type="monotone"
                        dataKey="vehicles"
                        stackId="1"
                        stroke="#474747"
                        fill="#474747"
                        fillOpacity={0.8}
                        name="Vehicles"
                      />
                      <Area
                        type="monotone"
                        dataKey="other"
                        stackId="1"
                        stroke="#94a3b8"
                        fill="#94a3b8"
                        fillOpacity={0.8}
                        name="Other"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  Last analysis: {new Date().toLocaleString()}
                </div>
                <Button
                  onClick={handleGenerateInsights}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <>
                      <span className="mr-2">Analyzing Events</span>
                      <Progress value={progress} className="w-20 h-2" />
                    </>
                  ) : (
                    'Generate New Insights'
                  )}
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="insights" className="space-y-4">
              {insights.map((insight) => (
                <Card key={insight.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      <div className={`w-full md:w-1 ${
                        insight.category === 'pattern' ? 'bg-blue-500' : 
                        insight.category === 'anomaly' ? 'bg-avianet-red' : 
                        'bg-green-500'
                      }`} />
                      <div className="p-4 flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          {getCategoryIcon(insight.category)}
                          <h3 className="font-medium">{insight.title}</h3>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatTimestamp(insight.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                          {insight.description}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-medium">Confidence:</span>
                            <div className="flex items-center space-x-2">
                              <Progress value={insight.confidence * 100} className="w-24 h-2" />
                              <span className="text-xs">{(insight.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(insight.metadata).map(([key, value]) => (
                              <span key={key} className="inline-flex items-center text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                                <span className="font-semibold mr-1 capitalize">{key}:</span>
                                <span>
                                  {Array.isArray(value) ? value.join(', ') : 
                                   key === 'rate' ? `${value}%` : 
                                   value}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            
            <TabsContent value="trends" className="space-y-4">
              <div className="border rounded-md p-4">
                <div className="mb-4">
                  <h3 className="text-lg font-medium">Object Detection Distribution</h3>
                  <p className="text-sm text-muted-foreground">
                    Analysis of detection types over a 24-hour period
                  </p>
                </div>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timeSeriesData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="persons"
                        stroke="#ea384c"
                        fill="#ea384c"
                        fillOpacity={0.8}
                        name="Persons"
                      />
                      <Area
                        type="monotone"
                        dataKey="vehicles"
                        stroke="#474747"
                        fill="#474747"
                        fillOpacity={0.8}
                        name="Vehicles"
                      />
                      <Area
                        type="monotone"
                        dataKey="other"
                        stroke="#94a3b8"
                        fill="#94a3b8"
                        fillOpacity={0.8}
                        name="Other"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Peak Detection Hours</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Persons</span>
                        <span className="text-sm font-medium">3:00 PM - 5:00 PM</span>
                      </div>
                      <Progress value={85} className="h-2" />
                      
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-sm">Vehicles</span>
                        <span className="text-sm font-medium">7:00 AM - 9:00 AM</span>
                      </div>
                      <Progress value={72} className="h-2" />
                      
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-sm">Other Objects</span>
                        <span className="text-sm font-medium">1:00 PM - 3:00 PM</span>
                      </div>
                      <Progress value={45} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Detection Confidence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">High Confidence (90%+)</span>
                        <span className="text-sm font-medium">42% of detections</span>
                      </div>
                      <Progress value={42} className="h-2" />
                      
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-sm">Medium Confidence (70-90%)</span>
                        <span className="text-sm font-medium">53% of detections</span>
                      </div>
                      <Progress value={53} className="h-2" />
                      
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-sm">Low Confidence (<70%)</span>
                        <span className="text-sm font-medium">5% of detections</span>
                      </div>
                      <Progress value={5} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIInsights;
