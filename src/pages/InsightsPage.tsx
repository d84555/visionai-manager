
import React from 'react';
import AIInsights from '@/components/insights/AIInsights';

const InsightsPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">AI Insights</h1>
      </div>
      
      <AIInsights />
    </div>
  );
};

export default InsightsPage;
