
import React from 'react';
import EventLogging from '@/components/events/EventLogging';

const EventsPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Event Logging</h1>
      </div>
      
      <EventLogging />
    </div>
  );
};

export default EventsPage;
