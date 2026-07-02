const advancedResults = (model, populate) => async (req, res, next) => {
  let query;
  const reqQuery = { ...req.query };
  const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
  removeFields.forEach((p) => delete reqQuery[p]);

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (m) => `$${m}`);

  query = model.find(JSON.parse(queryStr));

  if (req.query.search) {
    query = query.find({ $text: { $search: req.query.search } });
  }

  if (req.query.select) {
    query = query.select(req.query.select.split(',').join(' '));
  }

  if (req.query.sort) {
    query = query.sort(req.query.sort.split(',').join(' '));
  } else {
    query = query.sort('-createdAt');
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const skip = (page - 1) * limit;
  const total = await model.countDocuments(JSON.parse(queryStr));

  query = query.skip(skip).limit(limit);

  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach((p) => { query = query.populate(p); });
    } else {
      query = query.populate(populate);
    }
  }

  const results = await query;

  res.advancedResults = {
    success: true,
    count: results.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: results,
  };
  next();
};

module.exports = advancedResults;
