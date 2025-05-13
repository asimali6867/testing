const healthCheck = async (req, res) => {
  return res.status(200).json({
    message: "All Ok",
    status: 200, // 200 is the HTTP status code for "OK"
  });
};
export { healthCheck };
