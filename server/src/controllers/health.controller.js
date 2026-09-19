export function getHealth(_request, response) {
  response.set('Cache-Control', 'no-store');
  response.status(200).json({
    success: true,
    message: 'API is running.',
    data: {
      status: 'ok',
      service: 'RailConnect API',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
}
